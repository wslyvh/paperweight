import Database from "better-sqlite3";
import { getDb } from "../db";
import {
  findOrCreateVendor,
  getVendorDomain,
  updateVendorStats,
  updateVendorFlags,
  recomputeAllVendorFlags,
  matchVendorCompanies,
  categorizeVendors,
} from "./vendors";
import {
  insertMessageVendor,
  classifyMessageType,
  deleteMessagesByIds,
  getVendorIdsByMessageIds,
} from "./messages";
import { getSetting, hasValidLicense, getLicenseStatus } from "./settings";
import { loadCredentials } from "../credentials";
import { getProvider } from "../providers/ProviderFactory";
import { APP_CONFIG } from "@shared/config";
import { getRootDomain } from "@shared/utils";
import type { SyncStatus } from "@shared/types";
import { FREE_TIER_SYNC_DAYS, LICENSED_SYNC_DAYS } from "@shared/types";
import { syncLog } from "../utils/log";
import type { EmailMessage, EmailProvider } from "../providers/types";

export function friendlyConnectionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (/self.signed cert/i.test(msg)) {
    return 'Invalid server certificate. Try toggling "Self-signed cert".';
  }
  if (/WRONG_VERSION_NUMBER/i.test(msg)) {
    return 'TLS handshake failed. Try toggling "Implicit TLS".';
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `Connection refused at ${msg.match(/\d+\.\d+\.\d+\.\d+:\d+/)?.[0] ?? "the specified host/port"}. Check the mail server.`;
  }
  if (/ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return "Could not reach the mail server. Check the host and port.";
  }
  if (/authenticate|login|credentials|invalid|Command failed/i.test(msg)) {
    return "Authentication failed. Check your username and password.";
  }
  if (
    /Failed to refresh access token|invalid_grant|token.*expired|token.*revoked/i.test(
      msg,
    )
  ) {
    return "Authorization expired. Reconnect your account to continue syncing.";
  }

  return msg;
}

// --- Config ---

// Limits historical sync depth for development (e.g. HISTORICAL_SYNC_DAYS=180).
// Absent in production = full mailbox sync back to HISTORICAL_FLOOR_DATE.
const HISTORICAL_SYNC_DAYS = process.env.HISTORICAL_SYNC_DAYS
  ? parseInt(process.env.HISTORICAL_SYNC_DAYS, 10)
  : undefined;

const HISTORICAL_CHUNK_DAYS = 90;

// Production floor: covers all consumer email back to Hotmail/early IMAP era.
const HISTORICAL_FLOOR_DATE = new Date("1995-01-01");

// --- Sync state ---

interface SyncStateRow {
  last_sync_at: number | null;
  next_page_token: string | null;
  quick_sync_done_at: number | null;
  historical_cursor: number | null;
  historical_done: number;
  sync_checkpoint: string | null;
}

interface SyncStateUpdate {
  last_sync_at?: number | null;
  next_page_token?: string | null;
  quick_sync_done_at?: number | null;
  historical_cursor?: number | null;
  historical_done?: 0 | 1;
  sync_checkpoint?: string | null;
}

export function getSyncState() {
  const d = getDb();
  const row = d
    .prepare(
      "SELECT last_sync_at, next_page_token, quick_sync_done_at, historical_cursor, historical_done, sync_checkpoint FROM sync_state WHERE id = 1",
    )
    .get() as SyncStateRow;

  return {
    last_sync_at: row.last_sync_at ?? undefined,
    next_page_token: row.next_page_token ?? undefined,
    quick_sync_done_at: row.quick_sync_done_at ?? undefined,
    historical_cursor: row.historical_cursor ?? undefined,
    historical_done: row.historical_done === 1,
    sync_checkpoint: row.sync_checkpoint ?? undefined,
  };
}

export function updateSyncState(update: SyncStateUpdate): void {
  const d = getDb();
  // Build SET clause from only the provided keys (named params)
  const keys = Object.keys(update).filter(
    (k) => (update as Record<string, unknown>)[k] !== undefined,
  );
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  d.prepare(`UPDATE sync_state SET ${setClause} WHERE id = 1`).run(update);
}

export function clearSyncDataOnDb(db: Database.Database): void {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM vendors;
    UPDATE sync_state SET
      last_sync_at = NULL,
      next_page_token = NULL,
      quick_sync_done_at = NULL,
      historical_cursor = NULL,
      historical_done = 0,
      sync_checkpoint = NULL
    WHERE id = 1;
  `);
}

export function clearSyncData(): void {
  clearSyncDataOnDb(getDb());
}

// --- Batch processing ---

export function processMessagesBatch(messages: EmailMessage[]): void {
  if (messages.length === 0) return;

  const accountEmail = getSetting("accountEmail")?.toLowerCase();
  const vendorIds = new Set<number>();

  for (const msg of messages) {
    if (accountEmail && msg.senderEmail.toLowerCase() === accountEmail)
      continue;

    const domain = msg.senderEmail.split("@")[1];
    if (!domain) continue;

    if (
      APP_CONFIG.PERSONAL_DOMAINS.includes(domain) ||
      APP_CONFIG.PERSONAL_DOMAINS.includes(getRootDomain(domain))
    )
      continue;

    const vendorDomain = getVendorDomain(msg.senderEmail);
    const vendorId = findOrCreateVendor(vendorDomain);
    vendorIds.add(vendorId);

    const type = classifyMessageType(msg);
    insertMessageVendor(msg, vendorId, type);
  }

  for (const vid of vendorIds) {
    updateVendorStats(vid);
    updateVendorFlags(vid);
  }
}

// --- Sync orchestration ---

let currentStatus: SyncStatus = {
  running: false,
  progress: 0,
  total: 0,
  message: "",
};

// Progress emitter — injected by the caller context.
// Worker thread sets this to parentPort.postMessage; main thread sets it to BrowserWindow relay.
// Default is a no-op (safe if not set).
type ProgressEmitter = (status: SyncStatus) => void;
let _progressEmitter: ProgressEmitter = () => {};

export function setProgressEmitter(fn: ProgressEmitter): void {
  _progressEmitter = fn;
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

function emitProgress(partial: Omit<SyncStatus, "lastSyncAt">) {
  currentStatus = { ...partial, lastSyncAt: currentStatus.lastSyncAt };
  _progressEmitter(currentStatus);
}

// --- Checkpoint sync ---
// Uses provider-native change tracking (Gmail History API, future IMAP UID/CONDSTORE).
// Returns true on success, false when checkpoint expired (caller falls back to date-based).

async function runCheckpointSync(
  provider: EmailProvider,
  checkpoint: string,
): Promise<boolean> {
  emitProgress({
    running: true,
    progress: 0,
    total: 0,
    message: "Checking for new messages...",
    phase: "incremental",
  });

  const result = await provider.listChanges!(checkpoint);
  if (!result) return false; // checkpoint expired

  const changed = result.addedIds.length + result.deletedIds.length;
  if (changed > 0) {
    syncLog.info(
      `Checkpoint sync: ${result.addedIds.length} added, ${result.deletedIds.length} deleted`,
    );
  }

  // Fetch and process new messages
  if (result.addedIds.length > 0) {
    const messages: EmailMessage[] = [];
    let fetched = 0;

    for (const id of result.addedIds) {
      try {
        const msg = await provider.getMessage(id);
        messages.push(msg);
        fetched++;
        emitProgress({
          running: true,
          progress: fetched,
          total: result.addedIds.length,
          message: "Processing new messages...",
          phase: "incremental",
        });
      } catch (err) {
        syncLog.warn(`Failed to fetch added message ${id}:`, err);
      }
    }

    if (messages.length > 0) {
      processMessagesBatch(messages);
      recomputeAllVendorFlags();
      matchVendorCompanies();
      categorizeVendors();
    }
  }

  // Remove messages deleted from Gmail, then refresh stats for affected vendors
  if (result.deletedIds.length > 0) {
    const affectedVendorIds = getVendorIdsByMessageIds(result.deletedIds);
    deleteMessagesByIds(result.deletedIds);
    for (const vid of affectedVendorIds) {
      updateVendorStats(vid);
      updateVendorFlags(vid);
    }
  }

  const now = Date.now();
  updateSyncState({
    last_sync_at: now,
    sync_checkpoint: result.nextCheckpoint,
  });
  currentStatus.lastSyncAt = now;

  return true;
}

// --- Incremental sync ---
// First run: fetches last FREE_TIER_SYNC_DAYS (free) or LICENSED_SYNC_DAYS (licensed) days.
// Subsequent runs: uses checkpoint (History API) if available, else date-based since last_sync_at.

async function runIncrementalSync(
  provider: EmailProvider,
  licensed: boolean,
): Promise<void> {
  const syncState = getSyncState();

  // Fast path: checkpoint-based sync (Gmail History API)
  if (provider.listChanges && syncState.sync_checkpoint) {
    const used = await runCheckpointSync(provider, syncState.sync_checkpoint);
    if (used) return;
    syncLog.info(
      "Sync checkpoint expired, falling back to date-based incremental",
    );
  }

  const isFirstRun = !syncState.quick_sync_done_at;

  // First run window: licensed users get 1 year, free users get 30 days.
  // Subsequent runs use last_sync_at so the window size only matters on first run.
  const syncDays = licensed ? LICENSED_SYNC_DAYS : FREE_TIER_SYNC_DAYS;
  const since = syncState.last_sync_at
    ? new Date(syncState.last_sync_at)
    : new Date(Date.now() - syncDays * 86_400_000);

  syncLog.info(
    `Incremental sync: since ${since.toISOString()} (${isFirstRun ? "first run" : "incremental"})`,
  );

  let pageToken = syncState.next_page_token;
  let totalFetched = 0;
  let pageNum = 0;

  const providerEstimate = (await provider.getMessageCount(since)) ?? 0;

  emitProgress({
    running: true,
    progress: 0,
    total: providerEstimate,
    message: "Fetching messages...",
    phase: "incremental",
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    pageNum++;
    syncLog.info(`Incremental page ${pageNum}: fetching...`);

    const result = await provider.listMessages(
      since,
      undefined,
      pageToken,
      (fetched) => {
        emitProgress({
          running: true,
          progress: totalFetched + fetched,
          total: Math.max(providerEstimate, totalFetched + fetched),
          message: "Fetching messages...",
          phase: "incremental",
        });
      },
    );

    syncLog.info(
      `Incremental page ${pageNum}: ${result.messages.length} messages`,
    );

    if (result.messages.length > 0) {
      processMessagesBatch(result.messages);
      totalFetched += result.messages.length;
      matchVendorCompanies();
      categorizeVendors();

      emitProgress({
        running: true,
        progress: totalFetched,
        total: Math.max(providerEstimate, totalFetched),
        message: "Updating vendor data...",
        phase: "incremental",
      });
    }

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
      // Save checkpoint so an interrupted sync can resume mid-page
      updateSyncState({ last_sync_at: Date.now(), next_page_token: pageToken });
    } else {
      break;
    }
  }

  recomputeAllVendorFlags();
  matchVendorCompanies();
  categorizeVendors();

  const now = Date.now();
  const stateUpdate: SyncStateUpdate = {
    last_sync_at: now,
    next_page_token: null,
  };

  if (isFirstRun) {
    // Set historical cursor to the since date — historical sync walks backward from here
    stateUpdate.quick_sync_done_at = now;
    stateUpdate.historical_cursor = since.getTime();
    syncLog.info(
      `First incremental complete. Historical cursor initialised to ${since.toISOString()}`,
    );
  }

  // Capture sync checkpoint for next incremental (e.g. Gmail historyId)
  if (provider.getCurrentSyncCheckpoint) {
    const checkpoint = await provider.getCurrentSyncCheckpoint();
    if (checkpoint) {
      stateUpdate.sync_checkpoint = checkpoint;
    }
  }

  updateSyncState(stateUpdate);
  currentStatus.lastSyncAt = now;

  syncLog.info(
    `Incremental sync complete: ${totalFetched} messages, ${pageNum} pages`,
  );
}

// --- Historical sync ---
// Walks backward in HISTORICAL_CHUNK_DAYS chunks from historical_cursor.
// Returns { hasMore, count } — count is messages processed in this chunk.

async function runHistoricalChunk(
  provider: EmailProvider,
): Promise<{ hasMore: boolean; count: number }> {
  const syncState = getSyncState();

  if (syncState.historical_done) return { hasMore: false, count: 0 };
  if (syncState.historical_cursor === undefined)
    return { hasMore: false, count: 0 };

  const chunkMs = HISTORICAL_CHUNK_DAYS * 86_400_000;
  const cursor = syncState.historical_cursor;
  const until = new Date(cursor);
  let since = new Date(cursor - chunkMs);
  let isLastChunk = false;

  // Determine floor: dev limit via env var, otherwise hard floor of year 2000.
  const floorDate = HISTORICAL_SYNC_DAYS
    ? new Date(Date.now() - HISTORICAL_SYNC_DAYS * 86_400_000)
    : HISTORICAL_FLOOR_DATE;

  if (since <= floorDate) {
    since = floorDate;
    isLastChunk = true;
  }

  syncLog.debug(
    `Historical chunk: ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`,
  );

  const chunkEstimate = (await provider.getMessageCount(since, until)) ?? 0;

  emitProgress({
    running: true,
    progress: 0,
    total: chunkEstimate,
    message: "Syncing history",
    phase: "historical",
    historicalCursor: since.getTime(),
  });

  // Paginate through all messages in this date-range chunk.
  let pageToken: string | undefined;
  let totalFetched = 0;

  while (true) {
    const result = await provider.listMessages(
      since,
      until,
      pageToken,
      (fetched) => {
        emitProgress({
          running: true,
          progress: totalFetched + fetched,
          total: Math.max(chunkEstimate, totalFetched + fetched),
          message: "Syncing history",
          phase: "historical",
          historicalCursor: since.getTime(),
        });
      },
      true /* headersOnly — historical uses headers only, no body scan */,
    );

    if (result.messages.length > 0) {
      processMessagesBatch(result.messages);
      totalFetched += result.messages.length;
      matchVendorCompanies();
      categorizeVendors();
    }

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      break;
    }
  }

  // Always advance cursor backward (even through empty chunks — email gaps are normal).
  // Only stop when we've reached the floor date.
  if (isLastChunk) {
    recomputeAllVendorFlags();
    updateSyncState({ historical_cursor: since.getTime(), historical_done: 1 });
    return { hasMore: false, count: totalFetched };
  }

  updateSyncState({ historical_cursor: since.getTime() });
  return { hasMore: true, count: totalFetched };
}

// --- Main entry point ---

export async function runSync(licensedOverride?: boolean): Promise<void> {
  if (currentStatus.running) {
    syncLog.warn("Sync skipped (already running)");
    return;
  }

  const creds = loadCredentials();
  if (!creds) return;

  const provider = getProvider();

  emitProgress({
    running: true,
    progress: 0,
    total: 0,
    message: "Connecting...",
    phase: "incremental",
  });

  const startTime = Date.now();

  try {
    const connection = await provider.connect();
    syncLog.info(
      `Provider connected (${connection.type}, canModify: ${connection.canModify})`,
    );

    // getLicenseStatus() calls loadLicense() which uses safeStorage — unavailable in
    // worker threads. When licensedOverride is provided (worker context), skip it entirely.
    let licensed: boolean;
    if (licensedOverride !== undefined) {
      licensed = licensedOverride;
    } else {
      const licenseStatus = getLicenseStatus();
      licensed = licenseStatus.active && (await hasValidLicense());
    }

    // Phase 1: Incremental sync (always runs — window is 30d free / 365d licensed on first run)
    await runIncrementalSync(provider, licensed);

    // Phase 2: Historical headers-only sync (licensed users only, walks back to year 2000)
    if (licensed) {
      const syncState = getSyncState();
      if (
        !syncState.historical_done &&
        syncState.historical_cursor !== undefined
      ) {
        syncLog.info("Starting historical sync");
        let hasMore = true;
        let historicalMessages = 0;
        let historicalChunks = 0;
        let emptyChunks = 0;
        while (hasMore) {
          const result = await runHistoricalChunk(provider);
          hasMore = result.hasMore;
          historicalMessages += result.count;
          historicalChunks++;
          emptyChunks = result.count === 0 ? emptyChunks + 1 : 0;
          if (emptyChunks > 2) {
            recomputeAllVendorFlags();
            updateSyncState({ historical_done: 1 });
            syncLog.info(
              "Historical sync: no messages in 2 consecutive chunks, stopping early",
            );
            break;
          }
        }
        syncLog.info(
          `Historical sync complete: ${historicalMessages} messages in ${historicalChunks} chunks`,
        );
      }
    }

    await provider.disconnect();

    const syncState = getSyncState();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const d = getDb();
    const { msgCount } = d
      .prepare("SELECT COUNT(*) as msgCount FROM messages")
      .get() as { msgCount: number };
    const { vendorCount } = d
      .prepare("SELECT COUNT(*) as vendorCount FROM vendors")
      .get() as { vendorCount: number };
    syncLog.info(
      `Sync completed (${duration}s) — ${msgCount.toLocaleString()} messages, ${vendorCount.toLocaleString()} vendors`,
    );

    currentStatus.lastSyncAt = Date.now();
    emitProgress({
      running: false,
      progress: 0,
      total: 0,
      message: "Sync complete",
      historicalDone: syncState.historical_done,
    });
  } catch (err) {
    syncLog.error("Sync failed:", friendlyConnectionError(err));

    emitProgress({
      running: false,
      progress: 0,
      total: 0,
      message: "Sync failed",
      error: friendlyConnectionError(err),
    });

    try {
      await provider.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}
