import {
  analyzeMessage,
  analyzeText,
  ENGINE_VERSION,
  extractKnownAddressComponents,
  isSenderContact,
  normalizeValue,
  regionFromDomain,
} from "@paperweight/analysis";
import type {
  AnalyzeMessageOptions,
  Finding,
  KnownAddressComponents,
  KnownPiiValue,
  RawMessage,
  SenderContacts,
  UnsubscribeMethod,
} from "@paperweight/analysis";
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";
import { getDb } from "../db";
import { accountTag, emailToFileKey, listAccounts } from "../credentials";
import { getSetting, saveSetting } from "./settings";
import { recomputeAllVendorFlags } from "./vendors";
import { headerRecord, parseHeaderPairs } from "@shared/utils";
import { BODY_TEXT_MAX_LENGTH } from "@shared/config";
import { syncLog } from "../utils/log";

// How many messages to analyze between event-loop yields, so a large backlog
// doesn't starve sync progress / the UI. analyzeText is awaited per message
// (already yields on I/O-less microtasks), but detection itself is CPU-bound.
const YIELD_EVERY = 25;
const ANALYSIS_VERSION_SETTING = "analysis:findings-version";

interface AnalyzeRow {
  sender_email: string;
  body_text: string;
  unsubscribe_method: string | null;
}

interface CompanySelfRow {
  address: string | null;
  phone: string | null;
  sender_email: string | null;
}

interface ProfileAddressAnalysisRow {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  country: string | null;
  raw: string | null;
  value_normalized: string;
}

// Whether companies.db is attached and carries the table. Fixed for the life of
// a connection, so probing per message during a full pass is pure overhead.
const catalogueReady = new WeakMap<object, boolean>();

export function getKnownPiiValues(): KnownPiiValue[] {
  const target = getDb();
  const values = target
    .prepare(
      `SELECT DISTINCT type, value_normalized AS valueNormalized
       FROM global.profile_match_values
       WHERE value_normalized IS NOT NULL
         AND value_normalized != ''
       ORDER BY type, value_normalized`,
    )
    .all() as KnownPiiValue[];
  const addressRows = target
    .prepare(
      `SELECT street, house_number, postal_code, country, raw, value_normalized
       FROM global.profile_addresses
       ORDER BY value_normalized, raw IS NULL`,
    )
    .all() as ProfileAddressAnalysisRow[];
  const addressAnchors = new Map<string, KnownAddressComponents>();
  for (const row of addressRows) {
    const components = row.raw
      ? extractKnownAddressComponents(row.raw)
      : row.street && row.house_number && row.postal_code
        ? {
            street: normalizeValue("address", row.street),
            houseNumber: normalizeValue("address", row.house_number),
            postalCode: normalizeValue("address", row.postal_code),
            ...(row.country ? { country: row.country } : {}),
          }
        : undefined;
    if (components) addressAnchors.set(row.value_normalized, components);
  }

  return values.map((value) => {
    const addressComponents =
      value.type === "address"
        ? addressAnchors.get(value.valueNormalized)
        : undefined;
    return addressComponents ? { ...value, addressComponents } : value;
  });
}

// Profile values are detector input, so changing that set invalidates the same
// two gates as an engine update. Findings stay visible until each message is
// replaced atomically by runAnalysisPass().
export function invalidateAnalysisPass(
  target: Database.Database = getDb(),
): number {
  const invalidate = target.transaction(() => {
    const result = target
      .prepare(
        `UPDATE messages
         SET analysis_version = NULL
         WHERE body_state IN ('available', 'truncated')
           AND body_text IS NOT NULL`,
      )
      .run();
    target
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(ANALYSIS_VERSION_SETTING);
    return result.changes;
  });
  return invalidate();
}

export function invalidateAnalysisPassAtPath(path: string): boolean {
  if (!existsSync(path)) return false;

  const target = new Database(path);
  try {
    target.pragma("busy_timeout = 5000");
    invalidateAnalysisPass(target);
    return true;
  } finally {
    target.close();
  }
}

export function needsAnalysisPass(path: string): boolean {
  if (!existsSync(path)) return false;

  const target = new Database(path, { readonly: true });
  try {
    target.pragma("busy_timeout = 5000");
    const row = target
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(ANALYSIS_VERSION_SETTING) as { value: string } | undefined;
    return row?.value !== ENGINE_VERSION;
  } finally {
    target.close();
  }
}

// Main-thread entry point used immediately after an ownership-changing profile
// mutation. Persisting invalidation before returning means quitting the app
// cannot lose the need for a later Refresh catch-up pass.
export function invalidateAllAnalysisPasses(): number {
  // Lazy: this service also runs inside the worker thread, where Electron's app
  // module is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  const userData = app.getPath("userData");
  let failures = 0;

  for (const account of listAccounts()) {
    const path = join(userData, `${emailToFileKey(account.email)}.db`);
    try {
      invalidateAnalysisPassAtPath(path);
    } catch {
      failures++;
      syncLog.warn(
        `Could not invalidate profile analysis [${accountTag(account.email)}]`,
      );
    }
  }
  return failures;
}

function hasCompanyCatalogue(d: ReturnType<typeof getDb>): boolean {
  const cached = catalogueReady.get(d);
  if (cached !== undefined) return cached;
  const attached = !!d
    .prepare("SELECT name FROM pragma_database_list WHERE name = 'companies'")
    .get();
  const ready =
    attached &&
    !!d
      .prepare(
        "SELECT 1 FROM companies.sqlite_master WHERE type = 'table' AND name = 'companies'",
      )
      .get();
  catalogueReady.set(d, ready);
  return ready;
}

// Paperweight's company catalogue is application context, not detector
// vocabulary: the app looks up whose mail this is, the engine decides whether a
// finding is that company's own contact detail. Only worth a query when there
// is a finding whose type the catalogue can speak to.
function getSenderContacts(
  messageId: string,
  findings: Finding[],
): { contacts: SenderContacts; region?: string } | undefined {
  if (!findings.some((f) => f.type === "address" || f.type === "phone")) return undefined;

  const d = getDb();
  if (!hasCompanyCatalogue(d)) return undefined;

  const row = d
    .prepare(
      `SELECT c.address, c.phone, m.sender_email
       FROM messages m
       JOIN vendors v ON m.vendor_id = v.id
       JOIN companies.companies c ON v.company_slug = c.slug
       WHERE m.id = ?`,
    )
    .get(messageId) as CompanySelfRow | undefined;
  if (!row) return undefined;

  const contacts: SenderContacts = {
    ...(row.address ? { addresses: [row.address] } : {}),
    ...(row.phone ? { phones: [row.phone] } : {}),
  };
  const region = regionFromDomain(row.sender_email?.split("@")[1]);
  return { contacts, ...(region ? { region } : {}) };
}

// Replace one message's findings and stamp analysis_version — atomically, so the
// version is only advanced if the findings were written. Sync (better-sqlite3
// transactions can't be async); analysis runs before this, outside the txn.
//
// Two callers: the catch-up pass below, and sync itself — a message analyzed at
// parse time persists its findings here rather than waiting to be picked up
// again, so no body is ever analyzed twice.
export function persistFindings(
  messageId: string,
  findings: Finding[],
  truncatedBodyText?: string,
): void {
  const d = getDb();
  const sender = getSenderContacts(messageId, findings);
  const del = d.prepare("DELETE FROM pii_findings WHERE message_id = ?");
  const ins = d.prepare(
    `INSERT INTO pii_findings (
       message_id, type, value_normalized, country,
       in_quoted_text, in_footer, self_reference
     ) VALUES (
       @message_id, @type, @value_normalized, @country,
       @in_quoted_text, @in_footer, @self_reference
     )`,
  );
  const setVersion = d.prepare("UPDATE messages SET analysis_version = ? WHERE id = ?");
  const setTruncatedBody = d.prepare(
    "UPDATE messages SET body_text = ?, body_state = 'truncated' WHERE id = ?",
  );

  const replace = d.transaction((id: string, fs: Finding[], bodyText?: string) => {
    del.run(id);
    for (const f of fs) {
      ins.run({
        message_id: id,
        type: f.type,
        value_normalized: f.valueNormalized,
        country: f.country ?? null,
        in_quoted_text: f.inQuotedText ? 1 : 0,
        in_footer: f.inFooter ? 1 : 0,
        self_reference:
          f.selfReference ||
          (sender && isSenderContact(f, sender.contacts, sender.region))
            ? 1
            : 0,
      });
    }
    if (bodyText !== undefined) setTruncatedBody.run(bodyText, id);
    setVersion.run(ENGINE_VERSION, id);
  });

  replace(messageId, findings, truncatedBodyText);
}

// Analyze every message that has a stored body but no findings for the current
// engine version (never analyzed, or analyzed by an older engine). Reads SQLite
// only — no provider needed, so it doubles as offline re-analysis when
// ENGINE_VERSION changes. Returns the number of messages analyzed.
export async function runAnalysisPass(): Promise<number> {
  const d = getDb();
  if (getSetting(ANALYSIS_VERSION_SETTING) === ENGINE_VERSION) return 0;
  const knownValues = getKnownPiiValues();

  // NULL-safe: `analysis_version != ?` alone would drop the never-analyzed rows
  // (NULL != x is NULL), so the IS NULL branch is required.
  const ids = (
    d
      .prepare(
        `SELECT id FROM messages
         WHERE body_state IN ('available', 'truncated')
           AND body_text IS NOT NULL
           AND (analysis_version IS NULL OR analysis_version != ?)
         ORDER BY date DESC`,
      )
      .all(ENGINE_VERSION) as Array<{ id: string }>
  ).map((r) => r.id);

  if (ids.length === 0) {
    saveSetting(ANALYSIS_VERSION_SETTING, ENGINE_VERSION);
    return 0;
  }

  const fetch = d.prepare(
    "SELECT sender_email, body_text, unsubscribe_method FROM messages WHERE id = ?",
  );
  let analyzed = 0;
  let processed = 0;
  let failed = false;

  for (const id of ids) {
    const row = fetch.get(id) as AnalyzeRow | undefined;
    if (row?.body_text) {
      try {
        const text =
          row.body_text.length > BODY_TEXT_MAX_LENGTH
            ? row.body_text.slice(0, BODY_TEXT_MAX_LENGTH)
            : row.body_text;
        const senderDomain = row.sender_email.split("@")[1];
        const region = regionFromDomain(senderDomain);
        const analysis = await analyzeText(text, {
          ...(region ? { locale: region } : {}),
          ...(senderDomain ? { senderDomain } : {}),
          ...(row.unsubscribe_method === "footer"
            ? { footerLinkPresent: true }
            : {}),
          ...(knownValues.length > 0 ? { knownValues } : {}),
        });
        persistFindings(
          id,
          analysis.findings,
          text.length < row.body_text.length ? text : undefined,
        );
        analyzed++;
      } catch (err) {
        // Leave analysis_version unset so this message is retried next pass. Never
        // log the body or any value.
        failed = true;
        syncLog.error(`Analysis failed for a message: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      failed = true;
    }
    // Yield on messages processed (not succeeded), so a run of failures/skips
    // still yields on cadence.
    if (++processed % YIELD_EVERY === 0) await new Promise((r) => setImmediate(r));
  }

  syncLog.info(`Analysis pass: ${analyzed}/${ids.length} messages analyzed (engine ${ENGINE_VERSION})`);
  if (!failed && analyzed === ids.length) {
    saveSetting(ANALYSIS_VERSION_SETTING, ENGINE_VERSION);
  }
  return analyzed;
}

// --- The one-time switch to the engine's vocabulary ---

// Set by migrateEngineSwitch() (migrations.ts) on the first launch after the
// switch release, and cleared only once the pass below has walked every row. An
// interrupted run therefore repeats from the start next launch — cheaper than
// carrying a cursor, and harmless: the pass runs at the top of runSync before
// the provider connects, so a killed pass means the sync never began.
const RECLASSIFY_FLAG = "migration:reclassify";

interface ReclassifyRow {
  raw_headers: string | null;
  body_text: string | null;
  unsubscribe_url: string | null;
  unsubscribe_method: string | null;
}

const UNSUBSCRIBE_METHODS = new Set<UnsubscribeMethod>([
  "rfc8058",
  "list-unsubscribe",
  "footer",
]);

function knownUnsubscribe(
  row: ReclassifyRow,
): AnalyzeMessageOptions["knownUnsubscribe"] {
  if (
    !row.unsubscribe_url ||
    !UNSUBSCRIBE_METHODS.has(row.unsubscribe_method as UnsubscribeMethod)
  ) {
    return undefined;
  }
  return {
    method: row.unsubscribe_method as UnsubscribeMethod,
    target: row.unsubscribe_url,
  };
}

// Re-derive every stored message with the engine, from local data only: the
// lossless headers (both stored shapes) plus body_text where there is one. No
// provider, no network — this is what converts a pre-switch database to the new
// vocabulary in one pass.
//
// Re-deriving *every* row is safe precisely because this runs before the first
// post-switch sync: nothing has been classified at full fidelity yet, so there
// is no better verdict to overwrite. Rows the walk later re-visits are refreshed
// with html-informed results through the upsert.
//
// A no-op unless the migration flag is set. Returns the number of rows rewritten.
export async function runReclassifyPass(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (getSetting(RECLASSIFY_FLAG) !== "1") return 0;

  const d = getDb();
  const ids = (
    d.prepare("SELECT id FROM messages ORDER BY date DESC").all() as Array<{ id: string }>
  ).map((r) => r.id);

  if (ids.length === 0) {
    saveSetting(RECLASSIFY_FLAG, "0");
    return 0;
  }

  syncLog.info(`Reclassify pass: ${ids.length} messages to re-derive (engine ${ENGINE_VERSION})`);

  // One row at a time, like runAnalysisPass: bodies can be large, and holding
  // 40k of them to save a lookup is not a trade worth making.
  const fetch = d.prepare(
    "SELECT raw_headers, body_text, unsubscribe_url, unsubscribe_method FROM messages WHERE id = ?",
  );
  const setType = d.prepare("UPDATE messages SET type = ? WHERE id = ?");
  const setTypeAndUnsub = d.prepare(
    "UPDATE messages SET type = ?, unsubscribe_url = ?, unsubscribe_method = ? WHERE id = ?",
  );

  let failed = 0;
  let processed = 0;
  onProgress?.(0, ids.length);

  for (const id of ids) {
    const row = fetch.get(id) as ReclassifyRow | undefined;
    if (row) {
      try {
        const raw: RawMessage = { headers: headerRecord(parseHeaderPairs(row.raw_headers)) };
        // An empty string would read as "there is a text part" and change body
        // selection, so an absent body stays absent.
        if (row.body_text) raw.text = row.body_text;
        // No locale option needed: analyzeMessage falls back to the sender's
        // ccTLD, and raw_headers always carries From in either stored shape.
        const storedUnsubscribe = knownUnsubscribe(row);
        const analysis = await analyzeMessage(raw, {
          maxTextLength: BODY_TEXT_MAX_LENGTH,
          ...(storedUnsubscribe
            ? { knownUnsubscribe: storedUnsubscribe }
            : {}),
        });

        // Unsubscribe is upgraded, never cleared. A row with no html can't
        // re-derive a footer target an earlier full fetch found, and dropping
        // one would cost the user their only way off a list.
        if (analysis.unsubscribe) {
          setTypeAndUnsub.run(
            analysis.type,
            analysis.unsubscribe.target,
            analysis.unsubscribe.method,
            id,
          );
        } else {
          setType.run(analysis.type, id);
        }

        // Findings and the version stamp only for a row that has a body. Leaving
        // the stamp unset on a body-less row is what lets a later full fetch
        // analyze it.
        if (raw.text) {
          persistFindings(
            id,
            analysis.findings,
            analysis.textTruncated ? analysis.text : undefined,
          );
        }
      } catch (err) {
        // 'unknown' is the engine's own verdict for input it cannot read, so a
        // failed row lands there rather than keeping a dead vocabulary value.
        setType.run("unknown", id);
        failed++;
        syncLog.error(
          `Reclassify failed for a message: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (++processed % YIELD_EVERY === 0) {
      onProgress?.(processed, ids.length);
      await new Promise((r) => setImmediate(r));
    }
  }

  // has_marketing / has_account are denormalized from message type, so they are
  // stale until this runs. Everything else type-derived is computed at query time.
  recomputeAllVendorFlags();
  saveSetting(RECLASSIFY_FLAG, "0");
  onProgress?.(ids.length, ids.length);
  syncLog.info(`Reclassify pass complete: ${ids.length - failed}/${ids.length} messages re-derived`);
  return ids.length - failed;
}
