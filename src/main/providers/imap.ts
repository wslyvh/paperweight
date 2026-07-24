import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type { EmailProvider, EmailMessage, EmailConnection } from "./types";
import { loadCredentials } from "../credentials";
import { analyzeMessage } from "@paperweight/analysis";
import type { RawMessage } from "@paperweight/analysis";
import { BODY_TEXT_MAX_LENGTH } from "@shared/config";
import { headerRecord } from "@shared/utils";
import { friendlyConnectionError } from "./utils";
import { getSetting } from "../services/settings";
import { syncLog } from "../utils/log";

function connectImapWithErrorHandling(client: ImapFlow): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    client.on("error", onError);
    client.connect().then(
      () => {
        settled = true;
        client.removeListener("error", onError);
        resolve();
      },
      (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    );
  });
}

function createImapClient(): ImapFlow {
  const creds = loadCredentials();
  if (!creds?.imap) throw new Error("No IMAP credentials stored");

  return new ImapFlow({
    host: creds.imap.host,
    port: creds.imap.port,
    secure: creds.imap.tls,
    auth: {
      user: creds.imap.username,
      pass: creds.imap.password,
    },
    logger: false,
    tls: creds.imap.allowSelfSigned
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

function parseImapUid(messageId: string): number {
  // Message IDs are stored as "imap-{uid}" — uid is unique within the scanned mailbox.
  const match = messageId.match(/^imap-(\d+)$/);
  if (!match) throw new Error(`Invalid IMAP message ID: ${messageId}`);
  return parseInt(match[1], 10);
}

// mailparser 3.x groups ALL List-* headers (List-Unsubscribe, List-Id, etc.)
// under a single "list" object key in parsed.headers — the individual
// "list-unsubscribe" / "list-id" keys don't exist in that Map.
interface MailparserListHeader {
  unsubscribe?: { url?: string; mail?: string };
  "unsubscribe-post"?: { name?: string };
  id?: { name?: string };
}

// Build the lossless header list — stored as raw_headers and handed to the
// engine, which reads unsubscribe and bulk evidence off it.
//
// Strategy: use headerLines (raw text) as the canonical source, emitting an
// ordered [name, value] pair per line — ALL occurrences kept (duplicate
// Received:, To:, etc.), so alias/catch-all derivation stays a local parse job
// later. Then supplement List-* from the structured "list" object in case
// headerLines missed them (some bridge normalizations), so the engine can still
// find them.
export function buildHeaderPairs(
  parsed: import("mailparser").ParsedMail,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const seenKeys = new Set<string>();

  for (const { key, line } of parsed.headerLines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.substring(0, colon).trim();
    const value = line.substring(colon + 1).trim();
    if (!name) continue;
    pairs.push([name, value]);
    seenKeys.add(key);
  }

  // Supplement List-* only when absent from the raw lines.
  const listObj = parsed.headers.get("list") as MailparserListHeader | undefined;
  if (listObj) {
    if (!seenKeys.has("list-unsubscribe") && (listObj.unsubscribe?.url || listObj.unsubscribe?.mail)) {
      const { url, mail } = listObj.unsubscribe!;
      pairs.push([
        "List-Unsubscribe",
        [url && `<${url}>`, mail && `<mailto:${mail}>`].filter(Boolean).join(", "),
      ]);
    }
    if (!seenKeys.has("list-unsubscribe-post") && listObj["unsubscribe-post"]?.name) {
      pairs.push(["List-Unsubscribe-Post", listObj["unsubscribe-post"]!.name]);
    }
    if (!seenKeys.has("list-id") && listObj.id?.name) {
      pairs.push(["List-Id", `<${listObj.id.name}>`]);
    }
  }

  return pairs;
}

export async function parseImapMessage(
  msg: { uid: number; source?: Buffer; size?: number },
  idPrefix: string
): Promise<EmailMessage | undefined> {
  if (!msg.source) return undefined;

  // skipHtmlToText: mailparser must not fabricate parsed.text from the html part
  // (its html-to-text inlines raw urls). parsed.text is then only ever a genuine
  // text/plain part, so the engine's body-source rule sees the same inputs it
  // would from Gmail/Microsoft.
  const parsed = (await simpleParser(msg.source, {
    skipHtmlToText: true,
  })) as import("mailparser").ParsedMail;
  const from = parsed.from?.value?.[0];

  const pairs = buildHeaderPairs(parsed);
  const raw: RawMessage = { headers: headerRecord(pairs) };
  if (parsed.text) raw.text = parsed.text;
  if (parsed.html) raw.html = parsed.html;
  const analysis = await analyzeMessage(raw, {
    maxTextLength: BODY_TEXT_MAX_LENGTH,
  });

  // Source is capped at 100KB (see fetchOptions); RFC822.SIZE is the real full
  // size. If it exceeds what we fetched, conservatively record that the body
  // may be incomplete. A complete small text part plus a large attachment can
  // also trigger this; accurate MIME-part completeness needs part-aware fetches.
  const bodyTruncated = analysis.text.length > 0 && (msg.size ?? 0) > msg.source.length;

  const parsedTime = parsed.date?.getTime();
  return {
    id: `${idPrefix}${msg.uid}`,
    date: parsedTime && parsedTime > 946684800000 ? parsedTime : Date.now(),
    subject: parsed.subject || "",
    snippet: "",
    senderEmail: (from?.address || "").toLowerCase(),
    senderName: from?.name || "",
    headersJson: JSON.stringify(pairs),
    // Prefer RFC822.SIZE (real full size) over source buffer length (may be capped at 100KB)
    sizeBytes: msg.size ?? msg.source.length,
    analysis,
    bodyTruncated: bodyTruncated || analysis.textTruncated || undefined,
  };
}

async function findSpecialMailbox(
  client: ImapFlow,
  specialUse: string,
  fallbackNames: string[]
) {
  const mailboxes = await client.list();
  return (
    mailboxes.find((m) => m.specialUse === specialUse) ||
    mailboxes.find((m) => fallbackNames.includes(m.path))
  );
}

// Matches an "all mail" virtual mailbox by name when the server doesn't flag it with the
// \All special-use attribute. Anchored to avoid matching user folders like "Allies".
const ALL_MAIL_NAME = /^(?:\[Gmail\]\/)?All\s*(?:Mail|Items)$/i;

// Resolve the single mailbox to scan. Prefer the \All special-use mailbox (Gmail/Proton/
// Fastmail expose a deduplicated "all mail" superset); fall back to an anchored name match;
// otherwise INBOX (classic servers where each message lives in exactly one folder).
async function resolveScanMailbox(client: ImapFlow): Promise<string> {
  const mailboxes = await client.list();
  return (
    mailboxes.find((m) => m.specialUse === "\\All")?.path ||
    mailboxes.find((m) => ALL_MAIL_NAME.test(m.path))?.path ||
    "INBOX"
  );
}

export function createImapProvider(): EmailProvider {
  let client: ImapFlow | undefined;
  let scanMailbox: string | undefined;

  // The mailbox we scan for adds and operate on for per-message actions. Resolved once
  // per connection: \All ("all mail") when available, else INBOX.
  async function getScanMailbox(): Promise<string> {
    if (!client) throw new Error("Not connected to IMAP");
    if (!scanMailbox) scanMailbox = await resolveScanMailbox(client);
    return scanMailbox;
  }

  return {
    type: "imap",

    async connect(): Promise<EmailConnection> {
      const creds = loadCredentials();
      if (!creds?.imap) throw new Error("No IMAP credentials stored");

      client = createImapClient();
      await connectImapWithErrorHandling(client);

      return {
        type: "imap",
        email: getSetting("accountEmail") || creds.imap.username,
      };
    },

    isAuthenticated(): boolean {
      return client !== undefined;
    },

    async getMessageCount(_since?: Date, until?: Date): Promise<number | undefined> {
      // For date-range queries (historical chunks), a SEARCH requires a mailbox
      // lock which we don't hold here — return undefined and show count-based progress.
      if (until) return undefined;
      if (!client) return undefined;
      try {
        const status = await client.status(await getScanMailbox(), { messages: true });
        return status.messages;
      } catch {
        return undefined;
      }
    },

    async listMessages(
      since: Date,
      until?: Date,
      _pageToken?: string,
      onProgress?: (fetched: number, estimatedTotal?: number) => void
    ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
      if (!client) throw new Error("Not connected to IMAP");

      // Build date-range search criteria
      const criteria: { since: Date; before?: Date } = { since };
      if (until) criteria.before = until;

      // Partial source (100KB cap) captures headers + body text for scanning.
      // msg.size (RFC822.SIZE) gives the real full message size for storage metrics.
      const fetchOptions = {
        source: { start: 0, maxLength: 100_000 },
        envelope: true,
        uid: true,
        size: true,
      };

      const lock = await client.getMailboxLock(await getScanMailbox());
      const messages: EmailMessage[] = [];
      const estimate =
        (client.mailbox as { exists?: number })?.exists ?? undefined;

      try {
        for await (const msg of client.fetch(criteria, fetchOptions)) {
          try {
            const parsed = await parseImapMessage(
              msg as { uid: number; source?: Buffer; size?: number },
              "imap-",
            );
            if (parsed) messages.push(parsed);
            onProgress?.(messages.length, estimate);
          } catch (err) {
            syncLog.error(`Failed to parse IMAP message ${msg.uid}:`, err instanceof Error ? err.message : String(err));
          }
        }
      } finally {
        lock.release();
      }

      return { messages };
    },

    async getMessage(messageId: string): Promise<EmailMessage> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);

      const lock = await client.getMailboxLock(await getScanMailbox());
      try {
        const msg = await client.fetchOne(
          `${uid}`,
          { source: true, envelope: true, uid: true },
          { uid: true }  // treat first arg as UID, not sequence number
        );
        if (!msg) throw new Error(`Message ${messageId} not found`);

        const parsed = await parseImapMessage(msg, "imap-");
        if (!parsed) throw new Error(`Message ${messageId} could not be parsed`);
        return parsed;
      } finally {
        lock.release();
      }
    },

    async trashMessage(messageId: string): Promise<void> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);
      const trashMailbox = await findSpecialMailbox(client, "\\Trash", [
        "Trash",
        "Deleted Items",
        "Deleted Messages",
        "INBOX.Trash",
      ]);
      if (!trashMailbox) throw new Error("Trash folder not found");

      const lock = await client.getMailboxLock(await getScanMailbox());
      try {
        await client.messageMove(`${uid}`, trashMailbox.path, { uid: true });
      } finally {
        lock.release();
      }
    },

    async markAsSpam(messageId: string): Promise<void> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);
      const spamMailbox = await findSpecialMailbox(client, "\\Junk", [
        "Spam",
        "Junk",
        "Junk E-mail",
        "INBOX.Spam",
        "INBOX.Junk",
      ]);
      if (!spamMailbox) throw new Error("Spam/Junk folder not found");

      const lock = await client.getMailboxLock(await getScanMailbox());
      try {
        await client.messageMove(`${uid}`, spamMailbox.path, { uid: true });
      } finally {
        lock.release();
      }
    },

    async markAsRead(messageId: string, isRead: boolean): Promise<void> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);
      const lock = await client.getMailboxLock(await getScanMailbox());
      try {
        if (isRead) {
          await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove(`${uid}`, ["\\Seen"], { uid: true });
        }
      } finally {
        lock.release();
      }
    },

    async sendEmail(to: string, subject: string, body: string, inReplyTo?: string): Promise<string | undefined> {
      const creds = loadCredentials();
      if (!creds?.imap) throw new Error("No IMAP credentials stored");
      if (!creds.imap.smtp) throw new Error("No SMTP server configured for this account");

      const transporter = nodemailer.createTransport({
        host: creds.imap.smtp.host,
        port: creds.imap.smtp.port,
        secure: creds.imap.smtp.tls,
        auth: { user: creds.imap.username, pass: creds.imap.password },
        tls: creds.imap.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        logger: false,
      });

      try {
        // nodemailer generates the Message-ID; most SMTP servers pass it
        // through unchanged, but we can't read back what actually went out.
        const info = await transporter.sendMail({
          from: creds.imap.username,
          to,
          subject,
          text: body,
          ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
        });
        return info.messageId;
      } finally {
        transporter.close();
      }
    },

    // No removal tracking for IMAP: adds come from the date-range listMessages() path, and
    // there is no cheap server-side deletion signal (would need CONDSTORE/QRESYNC). Messages
    // deleted in another client linger until a full re-sync. getRemovalCursor/listRemovals
    // are intentionally not implemented.

    async disconnect(): Promise<void> {
      if (client) {
        await client.logout();
        client = undefined;
      }
      scanMailbox = undefined;
    },
  };
}

export async function testImapConnection(config: {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
  allowSelfSigned?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  let client: ImapFlow | undefined;
  try {
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.tls,
      auth: {
        user: config.username,
        pass: config.password,
      },
      logger: false,
      tls: config.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
    });

    await connectImapWithErrorHandling(client);
    await client.logout();
    return { success: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const responseText = (err as { responseText?: string })?.responseText;
    syncLog.error("IMAP connection error:", raw, responseText ? `— ${responseText}` : "");
    return {
      success: false,
      error: friendlyConnectionError(err),
    };
  }
}
