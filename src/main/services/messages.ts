import { getDb } from "../db";
import type { Message, MessageType, UnsubscribeEntry } from "@shared/types";
import { BODY_PREVIEW_LENGTH } from "@shared/types";
import type { EmailMessage } from "../providers/types";
import { actionableListMailSql } from "./messageVocabulary";

function stripQueryParams(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function insertActionLog(
  vendorId: number,
  actionType: "unsubscribed" | "trashed" | "spam_reported",
  messageCount: number,
  sizeBytes: number,
  senderEmail?: string,
  unsubscribeUrl?: string
): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO action_log (vendor_id, action_type, sender_email, unsubscribe_url, message_count, size_bytes, actioned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    vendorId,
    actionType,
    senderEmail ?? null,
    unsubscribeUrl ? stripQueryParams(unsubscribeUrl) : null,
    messageCount,
    sizeBytes,
    Date.now()
  );
}

// Renderer-facing columns. `raw_headers` is deliberately absent: no renderer
// consumer, and lossless header capture made it the biggest field on the row.
// body_text, body_state and analysis_version also stay in the main process.
// Main-side readers that need hidden columns select them themselves.
export const MESSAGE_COLUMNS =
  "id, vendor_id, sender_email, sender_name, subject, date, body_preview, " +
  "type, unsubscribe_url, unsubscribe_method, status, size_bytes";

export function insertMessageVendor(
  msg: EmailMessage,
  vendorId: number,
): boolean {
  const d = getDb();
  // body_text is the engine's analyzed text verbatim — finding offsets index
  // into it, so the two must never be computed separately. Empty body →
  // 'missing'. A body cut off by the app's analyzed-text cap or the provider
  // fetch cap (IMAP's 100KB source limit) → 'truncated'.
  const bodyText = msg.analysis.text.length > 0 ? msg.analysis.text : null;
  const bodyState = bodyText ? (msg.bodyTruncated ? "truncated" : "available") : "missing";

  const result = d.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, sender_name, subject, date, body_preview,
       raw_headers, type, unsubscribe_url, unsubscribe_method, status, size_bytes,
       body_text, body_state, analysis_version
     ) VALUES (
       @id, @vendor_id, @sender_email, @sender_name, @subject, @date, @body_preview,
       @raw_headers, @type, @unsubscribe_url, @unsubscribe_method, @status, @size_bytes,
       @body_text, @body_state, NULL
     )
     ON CONFLICT(id) DO UPDATE SET
       -- One rule for everything the fetch captured: a body-bearing fetch is
       -- strictly fuller than one without, so it wins; anything else leaves the
       -- stored row alone. Keeping body_text and the analysis that produced it
       -- in step is why the body follows the same rule as the rest.
       body_text = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.body_text ELSE messages.body_text END,
       body_state = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.body_state ELSE messages.body_state END,
       raw_headers = CASE
         WHEN excluded.body_state IN ('available', 'truncated') THEN excluded.raw_headers
         WHEN messages.raw_headers IS NULL THEN excluded.raw_headers
         ELSE messages.raw_headers END,
       type = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.type ELSE messages.type END,
       unsubscribe_url = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.unsubscribe_url ELSE messages.unsubscribe_url END,
       unsubscribe_method = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.unsubscribe_method ELSE messages.unsubscribe_method END,
       body_preview = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.body_preview ELSE messages.body_preview END,
       size_bytes = CASE WHEN excluded.body_state IN ('available', 'truncated')
         THEN excluded.size_bytes ELSE messages.size_bytes END
     WHERE (
       excluded.body_state IN ('available', 'truncated')
       AND (
         messages.body_text IS NOT excluded.body_text
         OR messages.body_state IS NOT excluded.body_state
         OR messages.raw_headers IS NOT excluded.raw_headers
         OR messages.type IS NOT excluded.type
         OR messages.unsubscribe_url IS NOT excluded.unsubscribe_url
         OR messages.unsubscribe_method IS NOT excluded.unsubscribe_method
         OR messages.body_preview IS NOT excluded.body_preview
         OR messages.size_bytes IS NOT excluded.size_bytes
       )
     ) OR (
       excluded.body_state = 'missing'
       AND messages.raw_headers IS NULL
       AND excluded.raw_headers IS NOT NULL
     )`
    // Deliberately not updated on conflict: vendor_id, status, analysis_version,
    // sender_*, subject, date. The first three are user/analysis state a re-walk
    // must not touch; the rest are already correct on any stored row.
  ).run({
    id: msg.id,
    vendor_id: vendorId,
    sender_email: msg.senderEmail,
    sender_name: msg.senderName ?? null,
    subject: msg.subject ?? null,
    date: msg.date,
    body_preview: (msg.analysis.text || msg.snippet)
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, BODY_PREVIEW_LENGTH),
    raw_headers: msg.headersJson,
    type: msg.analysis.type,
    unsubscribe_url: msg.analysis.unsubscribe?.target ?? null,
    unsubscribe_method: msg.analysis.unsubscribe?.method ?? "none",
    status: null,
    size_bytes: msg.sizeBytes ?? 0,
    body_text: bodyText,
    body_state: bodyState,
  });
  return result.changes > 0;
}

export function getMessagesByEmail(email: string, limit: number): Message[] {
  const d = getDb();
  return d
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE sender_email = ? ORDER BY date DESC LIMIT ?`)
    .all(email, limit) as Message[];
}

export function getMessagesByVendor(vendorId: number, limit: number): Message[] {
  const d = getDb();
  return d
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE vendor_id = ? ORDER BY date DESC LIMIT ?`)
    .all(vendorId, limit) as Message[];
}

export function markUnsubscribed(email: string): void {
  const d = getDb();
  d.prepare(
    `UPDATE messages SET status = 'unsubscribed'
     WHERE sender_email = ? AND unsubscribe_url IS NOT NULL`
  ).run(email);
}

// Re-derive per-message "unsubscribed" status from the durable action_log. Used after the
// all-mail migration cleared messages (IMAP/Microsoft): vendors and action_log survive the
// wipe, so we re-apply the vendor-wide unsubscribed flag to the re-synced messages.
// Vendor-keyed — no dependency on old message IDs. Idempotent.
export function reapplyUnsubscribedFromActionLog(): void {
  const d = getDb();
  d.prepare(
    `UPDATE messages SET status = 'unsubscribed'
     WHERE unsubscribe_url IS NOT NULL
       AND status IS NULL
       AND vendor_id IN (
         SELECT DISTINCT vendor_id FROM action_log WHERE action_type = 'unsubscribed'
       )`
  ).run();
}

export function getMessageById(id: string): Message | undefined {
  const d = getDb();
  return d.prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ?`).get(id) as
    | Message
    | undefined;
}

export function deleteMessagesByIds(ids: string[]): void {
  if (ids.length === 0) return;
  const d = getDb();
  const del = d.prepare("DELETE FROM messages WHERE id = ?");
  const deleteAll = d.transaction((ids: string[]) => {
    for (const id of ids) del.run(id);
  });
  deleteAll(ids);
}

export function getVendorIdsByMessageIds(ids: string[]): number[] {
  if (ids.length === 0) return [];
  const d = getDb();
  const get = d.prepare("SELECT vendor_id FROM messages WHERE id = ?");
  const vendorIds = new Set<number>();
  for (const id of ids) {
    const row = get.get(id) as { vendor_id: number } | undefined;
    if (row) vendorIds.add(row.vendor_id);
  }
  return Array.from(vendorIds);
}

export function markVendorUnsubscribed(vendorId: number): void {
  const d = getDb();
  const rows = d.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size
     FROM messages WHERE vendor_id = ? AND unsubscribe_url IS NOT NULL`
  ).get(vendorId) as { count: number; total_size: number };
  d.prepare(
    `UPDATE messages SET status = 'unsubscribed'
     WHERE vendor_id = ? AND unsubscribe_url IS NOT NULL`
  ).run(vendorId);
  if (rows.count > 0) {
    insertActionLog(vendorId, "unsubscribed", rows.count, rows.total_size);
  }
}

export function deleteVendorMessages(vendorId: number, types?: MessageType[]): { count: number; sizeBytes: number } {
  const d = getDb();
  const typeFilter = types?.length ? ` AND type IN (${types.map(() => "?").join(", ")})` : "";
  const params: (number | string)[] = types?.length ? [vendorId, ...types] : [vendorId];
  const rows = d.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM messages WHERE vendor_id = ?${typeFilter}`
  ).get(...params) as { count: number; total_size: number };
  d.prepare(`DELETE FROM messages WHERE vendor_id = ?${typeFilter}`).run(...params);
  return { count: rows.count, sizeBytes: rows.total_size };
}

export function getMessageIdsByVendor(vendorId: number, types?: MessageType[]): string[] {
  const d = getDb();
  if (types?.length) {
    const placeholders = types.map(() => "?").join(", ");
    return (
      d.prepare(`SELECT id FROM messages WHERE vendor_id = ? AND type IN (${placeholders})`).all(vendorId, ...types) as { id: string }[]
    ).map((r) => r.id);
  }
  return (
    d.prepare("SELECT id FROM messages WHERE vendor_id = ?").all(vendorId) as { id: string }[]
  ).map((r) => r.id);
}

export function getAllUnsubscribeMethodsForVendor(vendorId: number): UnsubscribeEntry[] {
  const d = getDb();
  // One entry per distinct method; picks the most recently seen URL for that method.
  const rows = d
    .prepare(
      `SELECT unsubscribe_method AS method, unsubscribe_url AS url, sender_email AS senderEmail
       FROM messages
       WHERE vendor_id = ?
         AND ${actionableListMailSql()}
         AND (status IS NULL OR status NOT IN ('unsubscribed'))
       GROUP BY unsubscribe_method
       ORDER BY date DESC`
    )
    .all(vendorId) as UnsubscribeEntry[];
  return rows;
}
