import { getDb } from "../db";
import {
  REMINDER_AFTER_DAYS,
  FOLLOWUP_AFTER_DAYS,
  ESCALATE_AFTER_DAYS,
  CASE_ACTIVITY_LOG_TYPES,
} from "@shared/cases";
import { LIST_MAIL_TYPES } from "@shared/types";
import { LIST_MAIL_TYPES_SQL } from "./messageVocabulary";
import type {
  ActionType,
  ActivityEntry,
  CreateGdprCaseInput,
  GdprCase,
  GdprCaseAction,
  GdprCaseDetail,
  GdprCaseEventInput,
  GdprCaseOutcome,
  GdprCaseStatus,
  GdprCaseSummary,
  GdprCaseReplies,
  GdprRequestType,
  Message,
} from "@shared/types";
import { parseHeaderPairs } from "@shared/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

// Keeps case-internal events (reminders, replies, links) out of the global and
// vendor activity feeds while letting the user-facing ones (request sent, case
// closed) through. Returns the SQL WHERE fragment (assumes the action_log alias
// is `a`) plus its bound params, so callers can't misorder the placeholders.
export function caseActivityFilter(): { clause: string; params: ActionType[] } {
  const placeholders = CASE_ACTIVITY_LOG_TYPES.map(() => "?").join(", ");
  return {
    clause: `(a.case_id IS NULL OR a.action_type IN (${placeholders}))`,
    params: CASE_ACTIVITY_LOG_TYPES,
  };
}

// Maps the gdpr_cases-joined columns of an action_log row onto ActivityEntry.
// Shared by getActivityLog and getVendorDetail so the case fields stay in sync.
export function mapCaseActivityFields(row: {
  case_id: number | null;
  case_request_type: string | null;
  case_outcome: string | null;
}): Pick<ActivityEntry, "caseId" | "caseRequestType" | "caseOutcome"> {
  return {
    caseId: row.case_id ?? undefined,
    caseRequestType: (row.case_request_type ?? undefined) as GdprRequestType | undefined,
    caseOutcome: (row.case_outcome ?? undefined) as GdprCaseOutcome | undefined,
  };
}

interface CaseRow {
  id: number;
  vendor_id: number;
  request_type: string;
  outcome: string | null;
  recipient_email: string | null;
  sent_message_id: string | null;
  opened_at: number;
  closed_at: number | null;
  last_viewed_at: number | null;
  account_email?: string | null;
}

interface EventRow {
  id: number;
  vendor_id: number;
  action_type: string;
  message_count: number;
  size_bytes: number;
  actioned_at: number;
  case_id: number | null;
  message_id: string | null;
  subject: string | null;
  body: string | null;
}

function mapCase(row: CaseRow): GdprCase {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    requestType: row.request_type as GdprCase["requestType"],
    status: row.closed_at ? "closed" : "active",
    outcome: (row.outcome ?? undefined) as GdprCase["outcome"],
    recipientEmail: row.recipient_email ?? undefined,
    sentMessageId: row.sent_message_id ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
  };
}

function mapEvent(row: EventRow, vendorName: string, vendorDomain?: string): ActivityEntry {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName,
    vendorDomain,
    actionType: row.action_type as ActionType,
    messageCount: row.message_count,
    sizeBytes: row.size_bytes,
    actionedAt: row.actioned_at,
    caseId: row.case_id ?? undefined,
    messageId: row.message_id ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body ?? undefined,
  };
}

// Statutory clock runs from opened_at and never resets.
export function deriveNextAction(
  openedAt: number,
  events: Array<{ actionType: ActionType }>,
): GdprCaseAction | undefined {
  const days = (Date.now() - openedAt) / DAY_MS;

  // Escalation is about non-fulfilment, so it stands even after the company
  // replies — a mere acknowledgement ("we received your request") is not an
  // answer and must not silence the 60-day statutory backstop.
  if (days >= ESCALATE_AFTER_DAYS) return "escalate";

  // Below the escalation line, a thread-matched or user-linked inbound reply
  // pauses the reminder/follow-up nudges: the ball is in the user's court to
  // read it, so we stop nagging them to chase.
  const hasInboundResponse = events.some(
    (e) => e.actionType === "reply_received" || e.actionType === "case_message_linked",
  );
  if (hasInboundResponse) return undefined;

  const reminderSent = events.some((e) => e.actionType === "reminder_sent");
  const followupSent = events.some((e) => e.actionType === "followup_sent");

  if (days >= FOLLOWUP_AFTER_DAYS && !followupSent) return "followup";
  if (days >= REMINDER_AFTER_DAYS && !reminderSent && !followupSent) return "reminder";
  return undefined;
}

// A case has an unseen reply when an inbound event (thread-matched or manually
// linked) landed after the case was last opened. `lastViewedAt` is null until
// the user first opens the case, so any prior reply counts as unseen.
function hasUnseenReply(
  lastViewedAt: number | null,
  events: Array<{ actionType: ActionType; actionedAt: number }>,
): boolean {
  const since = lastViewedAt ?? 0;
  return events.some(
    (e) =>
      (e.actionType === "reply_received" || e.actionType === "case_message_linked") &&
      e.actionedAt > since,
  );
}

export function createGdprCase(input: CreateGdprCaseInput): GdprCase {
  const d = getDb();
  const openedAt = input.openedAt ?? Date.now();
  const create = d.transaction(() => {
    const result = d
      .prepare(
        `INSERT INTO gdpr_cases (vendor_id, request_type, recipient_email, sent_message_id, opened_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.vendorId,
        input.requestType,
        input.recipientEmail ?? null,
        input.sentMessageId ?? null,
        openedAt,
      );
    const caseId = Number(result.lastInsertRowid);
    d.prepare(
      `INSERT INTO action_log (vendor_id, action_type, actioned_at, case_id, subject, body)
       VALUES (?, 'gdpr_request_sent', ?, ?, ?, ?)`,
    ).run(input.vendorId, openedAt, caseId, input.subject ?? null, input.body ?? null);
    return caseId;
  });
  const caseId = create();
  // Catch any replies already sitting in the mailbox at creation (manual or
  // backdated cases). Later replies are materialized by the sync pipeline, so
  // reply detection only ever happens on write paths — never on read.
  syncThreadMatchedReplies(caseId);
  return {
    id: caseId,
    vendorId: input.vendorId,
    requestType: input.requestType,
    status: "active",
    recipientEmail: input.recipientEmail,
    sentMessageId: input.sentMessageId,
    openedAt,
  };
}

function headerValue(rawHeaders: string | null, name: string): string | undefined {
  // First matching header wins. Accepts both the lossless [name, value][] and
  // legacy { name: value } shapes via the shared parser.
  const match = parseHeaderPairs(rawHeaders).find(
    ([k]) => k.toLowerCase() === name,
  );
  return match?.[1];
}

interface ReplyRow {
  id: string;
  vendor_id: number;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  date: number;
  body_preview: string | null;
  raw_headers: string | null;
  type: string | null;
}

function mapReplyRow(row: ReplyRow): Message {
  return {
    id: row.id,
    vendor_id: row.vendor_id,
    sender_email: row.sender_email,
    sender_name: row.sender_name ?? undefined,
    subject: row.subject ?? undefined,
    date: row.date,
    body_preview: row.body_preview ?? undefined,
    type: (row.type ?? undefined) as Message["type"],
  };
}

function isThreadMatch(rawHeaders: string | null, sentMessageId: string | null): boolean {
  if (!sentMessageId) return false;
  const thread =
    (headerValue(rawHeaders, "references") ?? "") +
    (headerValue(rawHeaders, "in-reply-to") ?? "");
  return thread.includes(sentMessageId);
}

export function getGdprCaseReplies(caseId: number): GdprCaseReplies {
  const d = getDb();
  const kase = d
    .prepare("SELECT vendor_id, opened_at, sent_message_id FROM gdpr_cases WHERE id = ?")
    .get(caseId) as { vendor_id: number; opened_at: number; sent_message_id: string | null } | undefined;
  if (!kase) return { threadMatches: [], otherReplies: [], linkedMessageIds: [] };

  const linkedMessageIds = (
    d
      .prepare(
        `SELECT message_id FROM action_log
         WHERE case_id = ? AND action_type = 'case_message_linked' AND message_id IS NOT NULL`,
      )
      .all(caseId) as Array<{ message_id: string }>
  ).map((row) => row.message_id);

  const rows = d
    .prepare(
      `SELECT id, vendor_id, sender_email, sender_name, subject, date, body_preview, raw_headers, type
       FROM messages
       WHERE vendor_id = ? AND date > ? AND (type IS NULL OR type NOT IN (${LIST_MAIL_TYPES_SQL}))
       ORDER BY date DESC`,
    )
    .all(kase.vendor_id, kase.opened_at) as ReplyRow[];

  const threadMatches: Message[] = [];
  const otherReplies: Message[] = [];
  for (const row of rows) {
    const message = mapReplyRow(row);
    if (isThreadMatch(row.raw_headers, kase.sent_message_id)) {
      threadMatches.push(message);
    } else {
      otherReplies.push(message);
    }
  }
  return { threadMatches, otherReplies, linkedMessageIds };
}

function syncThreadMatchedReplies(caseId: number): void {
  const d = getDb();
  const closed = d.prepare("SELECT closed_at FROM gdpr_cases WHERE id = ?").get(caseId) as
    | { closed_at: number | null }
    | undefined;
  if (!closed || closed.closed_at) return;

  const { threadMatches } = getGdprCaseReplies(caseId);
  const existsStmt = d.prepare(
    "SELECT 1 FROM action_log WHERE case_id = ? AND message_id = ? LIMIT 1",
  );
  for (const message of threadMatches) {
    if (existsStmt.get(caseId, message.id)) continue;
    insertGdprCaseEvent(caseId, "reply_received", {
      messageId: message.id,
      subject: message.subject,
    });
  }
}

// Materialize reply_received events for every open case belonging to the given
// vendors. Called from the mail-sync pipeline so thread-matched replies are
// recorded the moment mail is ingested — keeping the Dashboard/Cases list (which
// read stored events, not live inbox scans) consistent with the case detail view.
export function syncCaseRepliesForVendors(vendorIds: number[]): void {
  if (vendorIds.length === 0) return;
  const d = getDb();
  const placeholders = vendorIds.map(() => "?").join(", ");
  const openCases = d
    .prepare(
      `SELECT id FROM gdpr_cases WHERE closed_at IS NULL AND vendor_id IN (${placeholders})`,
    )
    .all(...vendorIds) as Array<{ id: number }>;
  for (const { id } of openCases) syncThreadMatchedReplies(id);
}

export function getGdprCaseById(id: number): GdprCaseDetail | undefined {
  // Pure read: reply materialization happens on write paths (create, mail
  // ingest, reopen), so loading a case never mutates it.
  const d = getDb();
  const row = d
    .prepare(
      `SELECT c.*, COALESCE(NULLIF(v.name, ''), v.root_domain, 'Unknown') as vendor_name,
              v.root_domain as vendor_domain, v.account_email as account_email
       FROM gdpr_cases c JOIN vendors v ON v.id = c.vendor_id
       WHERE c.id = ?`,
    )
    .get(id) as (CaseRow & { vendor_name: string; vendor_domain: string | null }) | undefined;
  if (!row) return undefined;

  const eventRows = d
    .prepare(
      `SELECT id, vendor_id, action_type, message_count, size_bytes, actioned_at, case_id, message_id, subject, body
       FROM action_log WHERE case_id = ? ORDER BY actioned_at DESC`,
    )
    .all(id) as EventRow[];
  const events = eventRows.map((r) => mapEvent(r, row.vendor_name, row.vendor_domain ?? undefined));

  return {
    ...mapCase(row),
    vendorName: row.vendor_name,
    vendorDomain: row.vendor_domain ?? undefined,
    accountEmail: row.account_email ?? undefined,
    nextAction: row.closed_at ? undefined : deriveNextAction(row.opened_at, events),
    hasUnseenReply: row.closed_at ? false : hasUnseenReply(row.last_viewed_at, eventRows.map((r) => ({ actionType: r.action_type as ActionType, actionedAt: r.actioned_at }))),
    lastViewedAt: row.last_viewed_at ?? undefined,
    events,
  };
}

export function queryGdprCases(filter?: { status?: GdprCaseStatus; vendorId?: number }): GdprCaseSummary[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.status) {
    conditions.push(filter.status === "active" ? "c.closed_at IS NULL" : "c.closed_at IS NOT NULL");
  }
  if (filter?.vendorId) {
    conditions.push("c.vendor_id = ?");
    params.push(filter.vendorId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = d
    .prepare(
      `SELECT c.*, COALESCE(NULLIF(v.name, ''), v.root_domain, 'Unknown') as vendor_name,
              v.root_domain as vendor_domain, v.account_email as account_email
       FROM gdpr_cases c JOIN vendors v ON v.id = c.vendor_id
       ${where} ORDER BY c.opened_at DESC`,
    )
    .all(...params) as Array<CaseRow & { vendor_name: string; vendor_domain: string | null }>;

  // Pull the events for every active case in one query (keyed by case_id)
  // instead of a per-case round trip, then derive nextAction/hasUnseenReply in memory.
  const activeIds = rows.filter((r) => !r.closed_at).map((r) => r.id);
  const eventsByCase = new Map<number, Array<{ actionType: ActionType; actionedAt: number }>>();
  if (activeIds.length > 0) {
    const placeholders = activeIds.map(() => "?").join(", ");
    const eventRows = d
      .prepare(
        `SELECT case_id, action_type, actioned_at FROM action_log WHERE case_id IN (${placeholders})`,
      )
      .all(...activeIds) as Array<{ case_id: number; action_type: string; actioned_at: number }>;
    for (const e of eventRows) {
      const list = eventsByCase.get(e.case_id) ?? [];
      list.push({ actionType: e.action_type as ActionType, actionedAt: e.actioned_at });
      eventsByCase.set(e.case_id, list);
    }
  }
  return rows.map((row) => {
    const events = eventsByCase.get(row.id) ?? [];
    const nextAction = row.closed_at ? undefined : deriveNextAction(row.opened_at, events);
    return {
      ...mapCase(row),
      vendorName: row.vendor_name,
      vendorDomain: row.vendor_domain ?? undefined,
      accountEmail: row.account_email ?? undefined,
      nextAction,
      hasUnseenReply: row.closed_at ? false : hasUnseenReply(row.last_viewed_at, events),
    };
  });
}

export function markGdprCaseViewed(id: number): void {
  getDb().prepare("UPDATE gdpr_cases SET last_viewed_at = ? WHERE id = ?").run(Date.now(), id);
}

// Nav-badge count: active cases with an inbound event newer than the case was
// last opened. Closed cases don't need a follow-up nudge, so they're excluded.
export function getUnseenCaseReplyCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT a.case_id) as count
       FROM action_log a
       JOIN gdpr_cases c ON c.id = a.case_id
       WHERE c.closed_at IS NULL
         AND a.action_type IN ('reply_received', 'case_message_linked')
         AND a.actioned_at > COALESCE(c.last_viewed_at, 0)`,
    )
    .get() as { count: number };
  return row.count;
}


export function closeGdprCase(id: number): void {
  const d = getDb();
  const close = d.transaction(() => {
    const row = d.prepare("SELECT vendor_id, closed_at FROM gdpr_cases WHERE id = ?").get(id) as
      | { vendor_id: number; closed_at: number | null }
      | undefined;
    if (!row) throw new Error(`Case ${id} not found`);
    // Idempotent: never overwrite an existing outcome (e.g. 'escalated') with
    // 'resolved' or log a second case_closed on a repeat/stale-UI close.
    if (row.closed_at) return;
    d.prepare("UPDATE gdpr_cases SET outcome = ?, closed_at = ? WHERE id = ?").run(
      "resolved",
      Date.now(),
      id,
    );
    d.prepare(
      "INSERT INTO action_log (vendor_id, action_type, actioned_at, case_id) VALUES (?, 'case_closed', ?, ?)",
    ).run(row.vendor_id, Date.now(), id);
  });
  close();
}

export function reopenGdprCase(id: number): void {
  const d = getDb();
  const reopen = d.transaction(() => {
    d.prepare("UPDATE gdpr_cases SET outcome = NULL, closed_at = NULL WHERE id = ?").run(id);
    // Drop the terminal events so activity feeds and the case timeline don't keep
    // showing a 'Closed'/'Escalated' entry for a case that is active again.
    d.prepare(
      "DELETE FROM action_log WHERE case_id = ? AND action_type IN ('case_closed', 'escalated')",
    ).run(id);
  });
  reopen();
  // A reply may have arrived while the case was closed (syncThreadMatchedReplies
  // skips closed cases); pick those up now that it's active again.
  syncThreadMatchedReplies(id);
}

export function escalateGdprCase(id: number): void {
  const d = getDb();
  const escalate = d.transaction(() => {
    const row = d.prepare("SELECT vendor_id, closed_at FROM gdpr_cases WHERE id = ?").get(id) as
      | { vendor_id: number; closed_at: number | null }
      | undefined;
    if (!row) throw new Error(`Case ${id} not found`);
    if (!row.closed_at) {
      d.prepare(
        "INSERT INTO action_log (vendor_id, action_type, actioned_at, case_id) VALUES (?, 'escalated', ?, ?)",
      ).run(row.vendor_id, Date.now(), id);
      d.prepare("UPDATE gdpr_cases SET outcome = ?, closed_at = ? WHERE id = ?").run(
        "escalated",
        Date.now(),
        id,
      );
      d.prepare(
        "INSERT INTO action_log (vendor_id, action_type, actioned_at, case_id) VALUES (?, 'case_closed', ?, ?)",
      ).run(row.vendor_id, Date.now(), id);
    }
  });
  escalate();
}

export function insertGdprCaseEvent(
  caseId: number,
  actionType: ActionType,
  details?: GdprCaseEventInput,
): void {
  const d = getDb();
  const row = d.prepare("SELECT vendor_id FROM gdpr_cases WHERE id = ?").get(caseId) as
    | { vendor_id: number }
    | undefined;
  if (!row) throw new Error(`Case ${caseId} not found`);
  d.prepare(
    `INSERT INTO action_log (vendor_id, action_type, actioned_at, case_id, message_id, subject, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.vendor_id,
    actionType,
    Date.now(),
    caseId,
    details?.messageId ?? null,
    details?.subject ?? null,
    details?.body ?? null,
  );
}

export function linkGdprCaseMessage(caseId: number, messageId: string): void {
  const d = getDb();
  const kase = d
    .prepare("SELECT vendor_id, opened_at FROM gdpr_cases WHERE id = ?")
    .get(caseId) as { vendor_id: number; opened_at: number } | undefined;
  if (!kase) throw new Error(`Case ${caseId} not found`);

  const message = d
    .prepare("SELECT vendor_id, date, type, subject FROM messages WHERE id = ?")
    .get(messageId) as
    | { vendor_id: number; date: number; type: string | null; subject: string | null }
    | undefined;
  if (!message) throw new Error(`Message ${messageId} not found`);
  if (message.vendor_id !== kase.vendor_id) {
    throw new Error("Message does not belong to this case's vendor");
  }
  if (message.date <= kase.opened_at) {
    throw new Error("Message predates this case");
  }
  // type comes off the raw row as free text, so widen rather than cast.
  if (message.type && (LIST_MAIL_TYPES as readonly string[]).includes(message.type)) {
    throw new Error("Marketing mail cannot be linked to a case");
  }

  const alreadyLinked = d
    .prepare(
      `SELECT 1 FROM action_log
       WHERE case_id = ? AND message_id = ?
         AND action_type IN ('reply_received', 'case_message_linked')
       LIMIT 1`,
    )
    .get(caseId, messageId);
  if (alreadyLinked) return;

  insertGdprCaseEvent(caseId, "case_message_linked", {
    messageId,
    subject: message.subject ?? undefined,
  });
}

export function unlinkGdprCaseMessage(caseId: number, messageId: string): void {
  const d = getDb();
  d.prepare(
    `DELETE FROM action_log
     WHERE case_id = ? AND message_id = ? AND action_type = 'case_message_linked'`,
  ).run(caseId, messageId);
}
