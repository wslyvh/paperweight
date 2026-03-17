import { getDb } from "../db";
import type { Message, MessageType, MessageStatus, UnsubscribeEntry } from "@shared/types";
import { BODY_PREVIEW_LENGTH } from "@shared/types";
import { TRANSACTIONAL_PATTERNS, ORDER_PATTERNS } from "@shared/languages";
import type { EmailMessage } from "../providers/types";
import { hasBulkHeaders, matchesAny } from "@shared/utils";

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

export function classifyMessageType(msg: EmailMessage): MessageType {
  const subject = msg.subject || "";
  const body = msg.bodyPreview || msg.snippet || "";
  const text = `${subject} ${body}`;

  // Check order/transactional first — more specific than bulk headers.
  // Many ESPs attach List-Unsubscribe to all outbound mail (required for Gmail
  // deliverability), including order confirmations. Checking bulk headers first
  // would misclassify an "Invoice" email as "bulk", hiding the order signal.
  if (matchesAny(text, ORDER_PATTERNS)) {
    return "order";
  }

  if (matchesAny(text, TRANSACTIONAL_PATTERNS)) {
    return "transactional";
  }

  const hasUnsubscribe =
    msg.unsubscribeUrl &&
    msg.unsubscribeMethod &&
    msg.unsubscribeMethod !== "none";

  if (hasUnsubscribe || hasBulkHeaders(msg.headersJson)) {
    return "bulk";
  }

  return "personal";
}

export function insertMessageVendor(
  msg: EmailMessage,
  vendorId: number,
  type: MessageType
) {
  const d = getDb();
  d.prepare(
    `INSERT OR IGNORE INTO messages (
      id, vendor_id, sender_email, sender_name, subject, date, body_preview,
      raw_headers, type, unsubscribe_url, unsubscribe_method, status, size_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    vendorId,
    msg.senderEmail,
    msg.senderName ?? null,
    msg.subject ?? null,
    msg.date,
    (msg.bodyPreview || msg.snippet || "").substring(0, BODY_PREVIEW_LENGTH),
    msg.headersJson,
    type,
    msg.unsubscribeUrl ?? null,
    msg.unsubscribeMethod ?? "none",
    null,
    msg.sizeBytes ?? 0
  );
}

export function getMessagesByEmail(email: string, limit: number): Message[] {
  const d = getDb();
  return d
    .prepare(`SELECT * FROM messages WHERE sender_email = ? ORDER BY date DESC LIMIT ?`)
    .all(email, limit) as Message[];
}

export function getMessagesByVendor(vendorId: number, limit: number): Message[] {
  const d = getDb();
  return d
    .prepare(`SELECT * FROM messages WHERE vendor_id = ? ORDER BY date DESC LIMIT ?`)
    .all(vendorId, limit) as Message[];
}

export function getUnsubscribeUrlByEmail(senderEmail: string): string | undefined {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT m.unsubscribe_url FROM messages m
       WHERE m.sender_email = ? AND m.unsubscribe_url IS NOT NULL AND m.unsubscribe_url != ''
       ORDER BY m.date DESC LIMIT 1`
    )
    .get(senderEmail) as { unsubscribe_url: string } | undefined;
  return row?.unsubscribe_url;
}

export function getUnsubscribeUrlForVendor(vendorId: number): string | undefined {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT unsubscribe_url FROM messages
       WHERE vendor_id = ? AND type = 'bulk' AND unsubscribe_url IS NOT NULL AND unsubscribe_url != ''
       ORDER BY date DESC LIMIT 1`
    )
    .get(vendorId) as { unsubscribe_url: string } | undefined;
  return row?.unsubscribe_url;
}

export function markUnsubscribed(email: string): void {
  const d = getDb();
  d.prepare(
    `UPDATE messages SET status = 'unsubscribed'
     WHERE sender_email = ? AND unsubscribe_url IS NOT NULL`
  ).run(email);
}

export function getMessageById(id: string): Message | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM messages WHERE id = ?").get(id) as
    | Message
    | undefined;
}

export function updateMessage(id: string, updates: { status?: MessageStatus }): void {
  const d = getDb();
  d.prepare("UPDATE messages SET status = ? WHERE id = ?").run(
    updates.status ?? null,
    id
  );
}

export function deleteMessage(id: string): void {
  const d = getDb();
  d.prepare("DELETE FROM messages WHERE id = ?").run(id);
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
         AND type = 'bulk'
         AND unsubscribe_url IS NOT NULL
         AND unsubscribe_url != ''
         AND (status IS NULL OR status NOT IN ('unsubscribed'))
       GROUP BY unsubscribe_method
       ORDER BY date DESC`
    )
    .all(vendorId) as UnsubscribeEntry[];
  return rows;
}
