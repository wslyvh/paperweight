import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailProvider, EmailMessage, EmailConnection } from "./types";
import { loadCredentials } from "../credentials";
import { cleanHtml, resolveUnsubscribe } from "./utils";
import { friendlyConnectionError } from "../services/sync";
import { getSetting } from "../services/settings";

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
  // Message IDs are stored as "imap-{uid}" or "imap-sent-{uid}"
  const match = messageId.match(/^imap-(?:sent-)?(\d+)$/);
  if (!match) throw new Error(`Invalid IMAP message ID: ${messageId}`);
  return parseInt(match[1], 10);
}

// --- Header extraction helpers ---
//
// mailparser 3.x groups ALL List-* headers (List-Unsubscribe, List-Id, etc.)
// under a single "list" object key in parsed.headers — the individual
// "list-unsubscribe" / "list-id" keys don't exist in that Map.
//
// We use a two-layer approach for maximum reliability across mailparser versions,
// IMAP server implementations (Proton Bridge, Dovecot, Exchange, etc.), and edge cases:
//
//   Layer 1 — structured "list" object (mailparser 3.x primary path)
//   Layer 2 — raw headerLines fallback (works regardless of mailparser grouping)

interface MailparserListHeader {
  unsubscribe?: { url?: string; mail?: string };
  "unsubscribe-post"?: { name?: string };
  id?: { name?: string };
}

// Extract the raw value of a specific header from mailparser's headerLines array.
// Returns the value part (after "Header-Name: ") or undefined if not present.
function getRawHeaderLine(
  headerLines: ReadonlyArray<{ key: string; line: string }>,
  headerName: string
): string | undefined {
  const lower = headerName.toLowerCase();
  const found = headerLines.find((h) => h.key === lower);
  if (!found) return undefined;
  const colon = found.line.indexOf(":");
  return colon !== -1 ? found.line.substring(colon + 1).trim() : undefined;
}

// Build the List-Unsubscribe and List-Unsubscribe-Post strings for resolveUnsubscribe().
// Tries the structured "list" object first, falls back to raw headerLines.
function extractListHeaders(parsed: import("mailparser").ParsedMail): {
  listUnsubStr: string | undefined;
  listUnsubPostStr: string | undefined;
  } {
  // Layer 1: mailparser's structured "list" object
  const listObj = parsed.headers.get("list") as MailparserListHeader | undefined;
  if (listObj?.unsubscribe) {
    const { url, mail } = listObj.unsubscribe;
    if (url || mail) {
      const listUnsubStr = [url && `<${url}>`, mail && `<mailto:${mail}>`]
        .filter(Boolean)
        .join(", ");
      const listUnsubPostStr = listObj["unsubscribe-post"]?.name;
      return { listUnsubStr, listUnsubPostStr };
    }
  }

  // Layer 2: raw headerLines (reliable across mailparser versions / unusual servers)
  const listUnsubStr = getRawHeaderLine(parsed.headerLines, "list-unsubscribe");
  const listUnsubPostStr = getRawHeaderLine(parsed.headerLines, "list-unsubscribe-post");
  return { listUnsubStr, listUnsubPostStr };
}

// Build a flat string-keyed headers map for hasBulkHeaders() classification.
//
// Strategy: use headerLines (raw text) as the canonical source — this gives correct
// string values for every header without mailparser object-wrapping issues.
// Expands the mailparser "list" object back into individual "list-unsubscribe" /
// "list-unsubscribe-post" / "list-id" keys so hasBulkHeaders() can find them.
function buildHeadersJson(parsed: import("mailparser").ParsedMail): string {
  const flat: Record<string, string> = {};

  // Populate from headerLines (raw text, no [object Object] risk)
  for (const { key, line } of parsed.headerLines) {
    const colon = line.indexOf(":");
    if (colon !== -1 && !flat[key]) {
      // Keep first occurrence of duplicate headers (e.g. multiple Received:)
      const value = line.substring(colon + 1).trim();
      if (value) flat[key] = value;
    }
  }

  // Ensure List-* headers are present using the structured object as a supplement,
  // in case headerLines missed them (e.g. some bridge normalizations).
  const listObj = parsed.headers.get("list") as MailparserListHeader | undefined;
  if (listObj) {
    if (!flat["list-unsubscribe"] && (listObj.unsubscribe?.url || listObj.unsubscribe?.mail)) {
      const { url, mail } = listObj.unsubscribe!;
      flat["list-unsubscribe"] = [url && `<${url}>`, mail && `<mailto:${mail}>`]
        .filter(Boolean)
        .join(", ");
    }
    if (!flat["list-unsubscribe-post"] && listObj["unsubscribe-post"]?.name) {
      flat["list-unsubscribe-post"] = listObj["unsubscribe-post"]!.name;
    }
    if (!flat["list-id"] && listObj.id?.name) {
      flat["list-id"] = `<${listObj.id.name}>`;
    }
  }

  return JSON.stringify(flat);
}

async function parseImapMessage(
  msg: { uid: number; source?: Buffer; size?: number },
  idPrefix: string
): Promise<EmailMessage | undefined> {
  if (!msg.source) return undefined;
  // Note: body is fetched (up to 100KB cap). Footer link extraction applies.

  const parsed = (await simpleParser(
    msg.source
  )) as import("mailparser").ParsedMail;
  const from = parsed.from?.value?.[0];
  const { listUnsubStr, listUnsubPostStr } = extractListHeaders(parsed);

  const unsub = resolveUnsubscribe(
    listUnsubStr,
    listUnsubPostStr,
    parsed.html || undefined,
    parsed.subject
  );

  const bodyText = parsed.text || "";
  const bodyHtml = parsed.html || "";
  const bodyPreview = (bodyText || cleanHtml(bodyHtml))
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);

  const parsedTime = parsed.date?.getTime();
  return {
    id: `${idPrefix}${msg.uid}`,
    date: parsedTime && parsedTime > 946684800000 ? parsedTime : Date.now(),
    subject: parsed.subject || "",
    snippet: (parsed.text || "").substring(0, 200),
    bodyPreview: bodyPreview || (parsed.text || "").substring(0, 150) || "",
    senderEmail: (from?.address || "").toLowerCase(),
    senderName: from?.name || "",
    unsubscribeUrl: unsub?.url,
    unsubscribeMethod: unsub?.method ?? "none",
    headersJson: buildHeadersJson(parsed),
    // Prefer RFC822.SIZE (real full size) over source buffer length (may be capped at 100KB)
    sizeBytes: msg.size ?? msg.source?.length ?? 0,
  };
}

async function parseImapHeadersOnly(
  msg: { uid: number; headers?: Buffer; size?: number },
  idPrefix: string
): Promise<EmailMessage | undefined> {
  if (!msg.headers) return undefined;

  // simpleParser handles a headers-only buffer (no body section required)
  const parsed = (await simpleParser(msg.headers)) as import("mailparser").ParsedMail;
  const from = parsed.from?.value?.[0];
  const { listUnsubStr, listUnsubPostStr } = extractListHeaders(parsed);

  // No body available — only header-based unsubscribe methods (rfc8058, list-unsubscribe)
  const unsub = resolveUnsubscribe(listUnsubStr, listUnsubPostStr, undefined, parsed.subject);

  const parsedTime = parsed.date?.getTime();
  return {
    id: `${idPrefix}${msg.uid}`,
    date: parsedTime && parsedTime > 946684800000 ? parsedTime : Date.now(),
    subject: parsed.subject || "",
    snippet: "",
    bodyPreview: "",
    senderEmail: (from?.address || "").toLowerCase(),
    senderName: from?.name || "",
    unsubscribeUrl: unsub?.url,
    unsubscribeMethod: unsub?.method ?? "none",
    headersJson: buildHeadersJson(parsed),
    sizeBytes: msg.size ?? 0,
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

export function createImapProvider(): EmailProvider {
  let client: ImapFlow | undefined;

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
        canRead: true,
        canModify: true,
        canSend: false,
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
        const status = await client.status("INBOX", { messages: true });
        return status.messages;
      } catch {
        return undefined;
      }
    },

    async listMessages(
      since: Date,
      until?: Date,
      _pageToken?: string,
      onProgress?: (fetched: number, estimatedTotal?: number) => void,
      headersOnly?: boolean
    ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
      if (!client) throw new Error("Not connected to IMAP");

      // Build date-range search criteria
      const criteria: { since: Date; before?: Date } = { since };
      if (until) criteria.before = until;

      // headersOnly: fetch just the header block (no body bytes).
      // Full mode: partial source (100KB cap) captures headers + body text for scanning.
      // msg.size (RFC822.SIZE) gives the real full message size for storage metrics.
      const fetchOptions = headersOnly
        ? { headers: true as const, uid: true, size: true }
        : { source: { start: 0, maxLength: 100_000 }, envelope: true, uid: true, size: true };

      const lock = await client.getMailboxLock("INBOX");
      const messages: EmailMessage[] = [];
      const inboxEstimate =
        (client.mailbox as { exists?: number })?.exists ?? undefined;

      try {
        for await (const msg of client.fetch(criteria, fetchOptions)) {
          try {
            const parsed = headersOnly
              ? await parseImapHeadersOnly(msg as { uid: number; headers?: Buffer; size?: number }, "imap-")
              : await parseImapMessage(msg as { uid: number; source?: Buffer; size?: number }, "imap-");
            if (parsed) messages.push(parsed);
            onProgress?.(messages.length, inboxEstimate);
          } catch (err) {
            console.error(`Failed to parse IMAP message ${msg.uid}:`, err);
          }
        }
      } finally {
        lock.release();
      }

      // Also fetch from Sent folder
      try {
        const sentMailbox = await findSpecialMailbox(client, "\\Sent", [
          "Sent",
          "Sent Items",
          "Sent Messages",
          "INBOX.Sent",
        ]);

        if (sentMailbox) {
          const sentLock = await client.getMailboxLock(sentMailbox.path);
          const sentEstimate =
            (client.mailbox as { exists?: number })?.exists ?? undefined;
          const combinedEstimate =
            inboxEstimate !== undefined && sentEstimate !== undefined
              ? inboxEstimate + sentEstimate
              : undefined;
          try {
            for await (const msg of client.fetch(criteria, fetchOptions)) {
              try {
                const parsed = headersOnly
                  ? await parseImapHeadersOnly(msg as { uid: number; headers?: Buffer; size?: number }, "imap-sent-")
                  : await parseImapMessage(msg as { uid: number; source?: Buffer; size?: number }, "imap-sent-");
                if (parsed) messages.push(parsed);
                onProgress?.(messages.length, combinedEstimate);
              } catch (err) {
                console.error(
                  `Failed to parse IMAP sent message ${msg.uid}:`,
                  err
                );
              }
            }
          } finally {
            sentLock.release();
          }
        }
      } catch (err) {
        console.error("Failed to fetch Sent folder:", err);
      }

      return { messages };
    },

    async getMessage(messageId: string): Promise<EmailMessage> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);
      const isSent = messageId.startsWith("imap-sent-");

      const mailboxPath = isSent
        ? (
            await findSpecialMailbox(client, "\\Sent", [
              "Sent",
              "Sent Items",
              "Sent Messages",
              "INBOX.Sent",
            ])
          )?.path || "INBOX"
        : "INBOX";

      const lock = await client.getMailboxLock(mailboxPath);
      try {
        const msg = await client.fetchOne(
          `${uid}`,
          { source: true, envelope: true, uid: true },
          { uid: true }  // treat first arg as UID, not sequence number
        );
        if (!msg) throw new Error(`Message ${messageId} not found`);

        const parsed = await parseImapMessage(
          msg,
          isSent ? "imap-sent-" : "imap-"
        );
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

      const lock = await client.getMailboxLock("INBOX");
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

      const lock = await client.getMailboxLock("INBOX");
      try {
        await client.messageMove(`${uid}`, spamMailbox.path, { uid: true });
      } finally {
        lock.release();
      }
    },

    async markAsRead(messageId: string, isRead: boolean): Promise<void> {
      if (!client) throw new Error("Not connected to IMAP");

      const uid = parseImapUid(messageId);
      const lock = await client.getMailboxLock("INBOX");
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

    // --- Checkpoint sync (UID-based) ---
    //
    // Checkpoint format: "{uidValidity}:{lastUid}"
    //   uidValidity — IMAP UIDVALIDITY value; changes when the server renumbers UIDs (rare).
    //                 Mismatch → return null → caller falls back to date-based sync.
    //   lastUid     — highest UID processed in the previous sync.
    //
    // Deletion tracking requires CONDSTORE/EXPUNGE — not implemented. deletedIds is always [].
    // Consequence: messages deleted from the email client linger in our DB until a date-based
    // fallback occurs (UIDVALIDITY change or first sync after install). Acceptable for now.

    async getCurrentSyncCheckpoint(): Promise<string | undefined> {
      if (!client) return undefined;
      try {
        const status = await client.status("INBOX", { uidNext: true, uidValidity: true });
        if (status.uidNext == null || status.uidValidity == null) return undefined;
        // uidNext is the next UID to be assigned; lastUid = uidNext - 1.
        // ImapFlow uses bigint for these — convert to number (safe: IMAP UIDs are 32-bit unsigned).
        const uidValidity = Number(status.uidValidity);
        const lastUid = Number(status.uidNext) - 1;
        return `${uidValidity}:${lastUid}`;
      } catch {
        return undefined;
      }
    },

    async listChanges(checkpoint: string): Promise<{
      addedIds: string[];
      deletedIds: string[];
      nextCheckpoint: string;
    } | null> {
      if (!client) return null;

      const parts = checkpoint.split(":");
      if (parts.length !== 2) return null;
      const expectedValidity = parseInt(parts[0], 10);
      const lastUid = parseInt(parts[1], 10);
      if (isNaN(expectedValidity) || isNaN(lastUid)) return null;

      const lock = await client.getMailboxLock("INBOX");
      try {
        // client.mailbox is boolean | MailboxObject; uidValidity/uidNext are bigint in ImapFlow
        const mailbox = (client.mailbox as unknown) as
          | { uidValidity?: bigint | number; uidNext?: bigint | number }
          | boolean
          | undefined;

        if (!mailbox || typeof mailbox === "boolean") return null;

        const currentValidity = mailbox.uidValidity != null ? Number(mailbox.uidValidity) : undefined;
        const currentUidNext = mailbox.uidNext != null ? Number(mailbox.uidNext) : lastUid + 1;

        // UIDVALIDITY changed → server renumbered UIDs → force full date-based re-sync
        if (currentValidity !== expectedValidity) return null;

        if (currentUidNext <= lastUid + 1) {
          // No new messages since last sync
          return { addedIds: [], deletedIds: [], nextCheckpoint: checkpoint };
        }

        const addedIds: string[] = [];
        for await (const msg of client.fetch(
          `${lastUid + 1}:*`,
          { uid: true },
          { uid: true }
        )) {
          addedIds.push(`imap-${msg.uid}`);
        }

        return {
          addedIds,
          deletedIds: [],
          nextCheckpoint: `${expectedValidity}:${currentUidNext - 1}`,
        };
      } finally {
        lock.release();
      }
    },

    async disconnect(): Promise<void> {
      if (client) {
        await client.logout();
        client = undefined;
      }
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
    console.error("IMAP connection error:", err);
    return {
      success: false,
      error: friendlyConnectionError(err),
    };
  }
}
