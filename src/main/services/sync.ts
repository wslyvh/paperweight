import { getDb } from "../db";
import {
  findOrCreateVendor,
  getVendorDomain,
  updateVendorStats,
  updateVendorFlags,
  recomputeAllVendorFlags,
  matchVendorCompanies,
  enrichVendorCategories,
} from "./vendors";
import {
  insertMessageVendor,
  deleteMessagesByIds,
  getVendorIdsByMessageIds,
  reapplyUnsubscribedFromActionLog,
} from "./messages";
import { persistFindings, runAnalysisPass, runReclassifyPass } from "./analysis";
import {
  getSetting,
  saveSetting,
  hasValidLicense,
  getLicenseStatus,
} from "./settings";
import { syncCaseRepliesForVendors } from "./cases";
import { loadCredentials } from "../credentials";
import { getProvider } from "../providers/ProviderFactory";
import { friendlyConnectionError } from "../providers/utils";
import { PERSONAL_DOMAINS } from "@paperweight/analysis/contracts";
import { getRootDomain } from "@shared/utils";
import type { SyncStatus } from "@shared/types";
import { FREE_TIER_SYNC_DAYS, LICENSED_SYNC_DAYS } from "@shared/types";
import { syncLog } from "../utils/log";
import type { EmailMessage, EmailProvider } from "../providers/types";

// --- Config ---

// Limits historical sync depth for development (e.g. HISTORICAL_SYNC_DAYS=180).
// Absent in production = full mailbox sync back to HISTORICAL_FLOOR_DATE.
const HISTORICAL_SYNC_DAYS = process.env.HISTORICAL_SYNC_DAYS
  ? parseInt(process.env.HISTORICAL_SYNC_DAYS, 10)
  : undefined;

const HISTORICAL_CHUNK_DAYS = 90;
// Isolated gaps are normal, but three empty windows (~270 days) are enough
// evidence that the account predates no more mail. The 1995 floor remains only
// an absolute fallback.
const HISTORICAL_EMPTY_CHUNK_LIMIT = 3;

// Incremental date-range adds re-query a small window before last_sync_at so a message
// arriving around the previous sync boundary isn't missed. Re-visited ids merge through
// insertMessageVendor's upsert, which keeps user state and takes the fuller capture.
const INCREMENTAL_OVERLAP_MS = 60 * 60 * 1000; // 1 hour

// Absolute production fallback: covers consumer email back to Hotmail/early
// IMAP. Normal walks stop after HISTORICAL_EMPTY_CHUNK_LIMIT empty chunks.
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

function updateSyncState(update: SyncStateUpdate): void {
  const d = getDb();
  // Build SET clause from only the provided keys (named params)
  const keys = Object.keys(update).filter(
    (k) => (update as Record<string, unknown>)[k] !== undefined,
  );
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  d.prepare(`UPDATE sync_state SET ${setClause} WHERE id = 1`).run(update);
}

export function clearSyncData(): void {
  getDb().exec(`
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

// --- Batch processing ---

function processMessagesBatch(messages: EmailMessage[]): void {
  if (messages.length === 0) return;

  const accountEmail = getSetting("accountEmail")?.toLowerCase();
  const vendorIds = new Set<number>();
  const storeAnalyzedMessage = getDb().transaction(
    (msg: EmailMessage, vendorId: number) => {
      const changed = insertMessageVendor(msg, vendorId);
      if (changed && msg.analysis.text.length > 0) {
        persistFindings(msg.id, msg.analysis.findings);
      }
    },
  );

  for (const msg of messages) {
    if (accountEmail && msg.senderEmail.toLowerCase() === accountEmail)
      continue;

    const domain = msg.senderEmail.split("@")[1];
    if (!domain) continue;

    if (
      PERSONAL_DOMAINS.includes(domain) ||
      PERSONAL_DOMAINS.includes(getRootDomain(domain))
    )
      continue;

    const vendorDomain = getVendorDomain(msg.senderEmail);
    const vendorId = findOrCreateVendor(vendorDomain);
    vendorIds.add(vendorId);

    // The engine already ran once, where the provider parsed this message: type
    // and unsubscribe go in with the row, findings atomically beside it (the FK
    // needs the row to exist). An identical overlap fetch is a no-op. Only a
    // message that actually carried a body gets its analysis_version stamped —
    // leaving it NULL on a body-less row lets a later full fetch be analyzed.
    storeAnalyzedMessage(msg, vendorId);
  }

  for (const vid of vendorIds) {
    updateVendorStats(vid);
    updateVendorFlags(vid);
  }

  // Record any newly-arrived thread-matched replies against open GDPR cases so
  // the Dashboard/Cases nudges reflect them without needing the detail view.
  syncCaseRepliesForVendors([...vendorIds]);
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

function emitProgress(partial: Omit<SyncStatus, "lastSyncAt">) {
  currentStatus = { ...partial, lastSyncAt: currentStatus.lastSyncAt };
  _progressEmitter(currentStatus);
}

// --- Removal pass ---
// Adds always come from the date-range listMessages() path. This pass applies *removals*
// (deletions / moves out of the tracked folder) reported by a provider's delta layer
// (Gmail History API, Microsoft inbox delta). The cursor is stored in
// sync_state.sync_checkpoint. On expiry the cursor is re-baselined and that gap's removals
// are skipped (graceful). Providers without listRemovals (IMAP) are a no-op.

async function runRemovalPass(provider: EmailProvider): Promise<void> {
  if (!provider.listRemovals || !provider.getRemovalCursor) return;

  const cursor = getSyncState().sync_checkpoint;

  // First time: establish a baseline so the next sync reports removals since now.
  if (!cursor) {
    const baseline = await provider.getRemovalCursor();
    if (baseline) updateSyncState({ sync_checkpoint: baseline });
    return;
  }

  const result = await provider.listRemovals(cursor);
  if (!result) {
    // Cursor expired → re-baseline; removals during the gap are not tracked.
    const baseline = await provider.getRemovalCursor();
    updateSyncState({ sync_checkpoint: baseline ?? null });
    syncLog.info("Removal cursor expired, re-baselined (gap removals skipped)");
    return;
  }

  if (result.removedIds.length > 0) {
    syncLog.info(`Removal pass: ${result.removedIds.length} removed`);
    const affectedVendorIds = getVendorIdsByMessageIds(result.removedIds);
    deleteMessagesByIds(result.removedIds);
    for (const vid of affectedVendorIds) {
      updateVendorStats(vid);
      updateVendorFlags(vid);
    }
  }

  updateSyncState({ sync_checkpoint: result.nextCursor });
}

// --- Re-derivation after the all-mail migration ---
// The IMAP all-mail switch clears messages (UIDs change namespace), but vendors and
// action_log survive. Once the re-sync has repopulated messages, re-apply per-message
// "unsubscribed" status from the action_log. Runs while the flag is set (idempotent);
// cleared once backfill is complete (historical for licensed, first incremental for free).
const REAPPLY_UNSUB_FLAG = "migration:reapply-unsub";

function maybeReapplyUnsubscribed(licensed: boolean): void {
  if (getSetting(REAPPLY_UNSUB_FLAG) !== "1") return;
  reapplyUnsubscribedFromActionLog();
  const syncState = getSyncState();
  const backfillComplete = licensed
    ? syncState.historical_done
    : !!syncState.quick_sync_done_at;
  if (backfillComplete) saveSetting(REAPPLY_UNSUB_FLAG, "0");
}

// --- Incremental sync ---
// First run: fetches last FREE_TIER_SYNC_DAYS (free) or LICENSED_SYNC_DAYS (licensed) days.
// Subsequent runs: date-based since last_sync_at (minus a small overlap). Removals are
// applied separately by runRemovalPass().

async function runIncrementalSync(
  provider: EmailProvider,
  licensed: boolean,
): Promise<void> {
  const syncState = getSyncState();

  const isFirstRun = !syncState.quick_sync_done_at;

  // First run window: licensed users get 1 year, free users get 90 days.
  // Subsequent runs use last_sync_at (minus a small overlap) so the window size only
  // matters on first run.
  const syncDays = licensed ? LICENSED_SYNC_DAYS : FREE_TIER_SYNC_DAYS;
  const since = syncState.last_sync_at
    ? new Date(syncState.last_sync_at - INCREMENTAL_OVERLAP_MS)
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

  // Determine floor: dev limit via env var, otherwise the 1995 fallback.
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
  const chunkStart = Date.now();

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
    );

    if (result.messages.length > 0) {
      processMessagesBatch(result.messages);
      totalFetched += result.messages.length;
    }

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      break;
    }
  }

  // Counts and elapsed time only — never a subject, sender or body. This is the
  // number that tells us whether the walk is fetch-bound or engine-bound.
  const chunkSeconds = ((Date.now() - chunkStart) / 1000).toFixed(0);
  syncLog.info(
    `Historical chunk ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}` +
      ` — ${totalFetched} messages in ${chunkSeconds}s`,
  );

  // Always advance through this chunk, including an empty one. The caller
  // stops after a bounded consecutive-empty streak; the floor is the absolute
  // fallback for accounts whose history remains populated throughout.
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
    // Phase 0: convert a pre-switch database to the engine's vocabulary. Local
    // data only, so it runs before we connect — an offline launch still gets a
    // converged dataset, and no freshly-synced row exists yet for it to
    // re-derive down to a header-only verdict. A no-op after the first run.
    await runReclassifyPass((done, total) => {
      emitProgress({
        running: true,
        progress: done,
        total,
        message: "Updating your mail",
        phase: "incremental",
      });
    });

    // Findings-version catch-up is local too. Run it before provider access so
    // an engine upgrade converges the stored mailbox even when the account is
    // temporarily offline. Newly fetched messages persist current findings
    // inline and do not need a second pass.
    await runAnalysisPass();

    const connection = await provider.connect();
    syncLog.info(`Provider connected (${connection.type})`);

    // getLicenseStatus() calls loadLicense() which uses safeStorage — unavailable in
    // worker threads. When licensedOverride is provided (worker context), skip it entirely.
    let licensed: boolean;
    if (licensedOverride !== undefined) {
      licensed = licensedOverride;
    } else {
      const licenseStatus = getLicenseStatus();
      licensed = licenseStatus.active && (await hasValidLicense());
    }

    // Phase 1: Incremental sync (always runs — window is 90d free / 365d licensed on first run)
    await runIncrementalSync(provider, licensed);

    // Phase 1.5: Apply removals (deletions / moves out of the tracked folder) for
    // providers with a delta layer (Gmail, Microsoft). No-op for IMAP.
    await runRemovalPass(provider);

    // Phase 2: Historical sync (licensed users only). Full fetch, same as
    // incremental — bodies and findings land for history too. Isolated empty
    // chunks are crossed; three consecutive empty chunks finish the walk.
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
          if (hasMore && emptyChunks >= HISTORICAL_EMPTY_CHUNK_LIMIT) {
            recomputeAllVendorFlags();
            updateSyncState({ historical_done: 1 });
            syncLog.info(
              `Historical sync: no messages in ${HISTORICAL_EMPTY_CHUNK_LIMIT} consecutive chunks, stopping early`,
            );
            break;
          }
        }
        syncLog.info(
          `Historical sync complete: ${historicalMessages} messages in ${historicalChunks} chunks`,
        );
      }
    }

    // Catalogue enrichment is global, static work. Run it once after both sync
    // phases; the transaction exposes either the old or the fully derived
    // category set and only writes rows whose result changed.
    recomputeAllVendorFlags();
    matchVendorCompanies();
    enrichVendorCategories();

    // Re-derive "unsubscribed" message status after an all-mail migration re-sync.
    maybeReapplyUnsubscribed(licensed);

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
