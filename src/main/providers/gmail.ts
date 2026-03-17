import type { EmailProvider, EmailMessage, EmailConnection } from "./types";
import { loadCredentials, saveCredentials } from "../credentials";
import { cleanHtml, resolveUnsubscribe, runLoopbackAuth } from "./utils";

// Injected at build time via electron-vite define.
// Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars before building.
declare const __GOOGLE_CLIENT_ID__: string;
declare const __GOOGLE_CLIENT_SECRET__: string;
const CLIENT_ID = __GOOGLE_CLIENT_ID__;
const CLIENT_SECRET = __GOOGLE_CLIENT_SECRET__;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const SCOPES_MODIFY =
  "https://www.googleapis.com/auth/gmail.modify";

// --- OAuth ---

export async function startLoopbackAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const scopes = SCOPES_MODIFY;
    const { code, redirectUri } = await runLoopbackAuth(
      "http://127.0.0.1",
      (redirectUri) => {
        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set("client_id", CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        return authUrl.toString();
      }
    );

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Token exchange failed (${response.status}): ${text}`,
      };
    }

    const data = await response.json();

    if (data.error) {
      return {
        success: false,
        error: `${data.error}: ${data.error_description || ""}`,
      };
    }

    if (data.access_token) {
      saveCredentials({
        providerType: "gmail",
        gmail: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || "",
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        },
      });
      return { success: true };
    }

    return { success: false, error: "No access token in response" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Token management ---

async function getValidAccessToken(): Promise<string> {
  const creds = loadCredentials();
  if (!creds?.gmail) throw new Error("No Gmail credentials stored");

  if (Date.now() < creds.gmail.expiresAt - 60_000) {
    return creds.gmail.accessToken;
  }

  // Refresh the token
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: creds.gmail.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (data.access_token) {
    creds.gmail.accessToken = data.access_token;
    creds.gmail.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    saveCredentials(creds);
    return data.access_token;
  }

  const errDetail = data.error_description || data.error || "Unknown error";
  throw new Error(`Failed to refresh access token: ${errDetail}`);
}

// --- Gmail API helpers ---

async function gmailApiFetch(
  path: string,
  params?: Record<string, string | string[]>
): Promise<unknown> {
  const token = await getValidAccessToken();
  const url = new URL(`${GMAIL_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const val of v) url.searchParams.append(k, val);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${text}`);
  }

  return response.json();
}

async function gmailApiPost(
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const token = await getValidAccessToken();
  const url = `${GMAIL_API_BASE}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${text}`);
  }

  return response.json();
}

// --- Profile ---

export async function fetchGmailProfileEmail(
  accessToken: string
): Promise<string | undefined> {
  try {
    const resp = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return undefined;
    const profile = (await resp.json()) as { emailAddress?: string };
    return profile.emailAddress;
  } catch {
    return undefined;
  }
}

// --- Message parsing ---

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim(),
      email: match[2].toLowerCase(),
    };
  }
  // Handle bare angle-bracketed address with no display name: <email@domain.com>
  const bareMatch = raw.match(/^<([^>]+)>$/);
  if (bareMatch) {
    return { name: "", email: bareMatch[1].toLowerCase() };
  }
  const emailMatch = raw.match(/[^\s<>]+@[^\s<>]+/);
  return { name: "", email: emailMatch ? emailMatch[0].toLowerCase() : raw.toLowerCase().trim() };
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

type MimePart = {
  mimeType: string;
  body?: { data?: string };
  parts?: MimePart[];
};

function extractPartByMime(parts: MimePart[], mime: string): string {
  for (const part of parts) {
    if (part.mimeType === mime && part.body?.data) {
      return base64UrlDecode(part.body.data);
    }
    if (part.parts) {
      const result = extractPartByMime(part.parts, mime);
      if (result) return result;
    }
  }
  return "";
}

interface GmailHistoryEntry {
  id: string;
  messagesAdded?: Array<{ message: { id: string } }>;
  messagesDeleted?: Array<{ message: { id: string } }>;
}

interface GmailHistoryResponse {
  history?: GmailHistoryEntry[];
  historyId: string;
  nextPageToken?: string;
}

interface GmailRawMessage {
  id: string;
  snippet: string;
  internalDate: string;
  sizeEstimate?: number;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string };
    parts?: MimePart[];
  };
}

function parseGmailMessage(msg: GmailRawMessage): EmailMessage {
  const headers = msg.payload.headers;
  const getHeader = (name: string): string =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    "";

  const fromRaw = getHeader("From");
  const { name: senderName, email: senderEmail } = parseEmailAddress(fromRaw);
  const listUnsub = getHeader("List-Unsubscribe") || undefined;
  const listUnsubPost = getHeader("List-Unsubscribe-Post") || undefined;

  let bodyText = "";
  let bodyHtml = "";
  if (msg.payload.parts) {
    bodyText = extractPartByMime(msg.payload.parts, "text/plain");
    bodyHtml = extractPartByMime(msg.payload.parts, "text/html");
  } else if (msg.payload.body?.data) {
    const decoded = base64UrlDecode(msg.payload.body.data);
    if (msg.payload.mimeType === "text/html") {
      bodyHtml = decoded;
    } else {
      bodyText = decoded;
    }
  }

  const subject = getHeader("Subject");
  const rawHeaders = Object.fromEntries(headers.map((h) => [h.name, h.value]));
  const headersJson = JSON.stringify(rawHeaders);

  const unsub = resolveUnsubscribe(listUnsub, listUnsubPost, bodyHtml, subject);
  const bodyPreview = (bodyText || cleanHtml(bodyHtml))
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);

  const internalDate = parseInt(msg.internalDate, 10);
  const date = !isNaN(internalDate)
    ? internalDate
    : (() => {
        const t = new Date(getHeader("Date")).getTime();
        return !isNaN(t) && t > 946684800000 ? t : Date.now();
      })();

  return {
    id: msg.id,
    date,
    subject,
    snippet: msg.snippet,
    bodyPreview: bodyPreview || msg.snippet?.substring(0, 150) || "",
    senderEmail,
    senderName,
    unsubscribeUrl: unsub?.url,
    unsubscribeMethod: unsub?.method ?? "none",
    headersJson,
    sizeBytes: msg.sizeEstimate ?? 0,
  };
}

// --- Provider ---

export function createGmailProvider(): EmailProvider {
  return {
    type: "gmail",

    async connect(): Promise<EmailConnection> {
      const token = await getValidAccessToken();
      const creds = loadCredentials();
      const email = await fetchGmailProfileEmail(token);

      return {
        type: "gmail-oauth",
        email: email || "",
        canRead: true,
        canModify: true,
        canSend: false,
      };
    },

    isAuthenticated(): boolean {
      const creds = loadCredentials();
      return !!creds?.gmail?.accessToken;
    },

    async getMessageCount(since: Date, until?: Date): Promise<number | undefined> {
      try {
        // Use messages.list with maxResults=1 to get resultSizeEstimate
        // for the same query scope the sync will use (excludes spam/trash).
        // Profile's messagesTotal includes spam/trash so it overestimates.
        const afterEpoch = Math.floor(since.getTime() / 1000);
        const params: Record<string, string> = { maxResults: "1" };
        const qParts: string[] = [];
        if (afterEpoch > 0) qParts.push(`after:${afterEpoch}`);
        if (until) qParts.push(`before:${Math.floor(until.getTime() / 1000)}`);
        if (qParts.length > 0) params.q = qParts.join(" ");
        const result = (await gmailApiFetch("/messages", params)) as {
          resultSizeEstimate?: number;
        };
        return result.resultSizeEstimate;
      } catch {
        return undefined;
      }
    },

    async listMessages(
      since: Date,
      until?: Date,
      pageToken?: string,
      onProgress?: (fetched: number, estimatedTotal?: number) => void,
      headersOnly?: boolean
    ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
      const afterEpoch = Math.floor(since.getTime() / 1000);

      const params: Record<string, string> = {
        maxResults: "50",
      };
      // Build date-range query. after:0 is unreliable so only add when non-zero.
      const qParts: string[] = [];
      if (afterEpoch > 0) qParts.push(`after:${afterEpoch}`);
      if (until) qParts.push(`before:${Math.floor(until.getTime() / 1000)}`);
      if (qParts.length > 0) params.q = qParts.join(" ");
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const listResult = (await gmailApiFetch("/messages", params)) as {
        messages?: Array<{ id: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      if (!listResult.messages || listResult.messages.length === 0) {
        return { messages: [] };
      }

      const estimatedTotal = listResult.resultSizeEstimate;
      const emailMessages: EmailMessage[] = [];

      for (const msgRef of listResult.messages) {
        try {
          // headersOnly: metadata format with explicit metadataHeaders — avoids relying
          // on undocumented default header set. parseGmailMessage handles missing body
          // by returning empty bodyPreview and falling back to snippet.
          const params: Record<string, string | string[]> = {
            format: headersOnly ? "metadata" : "full",
          };
          if (headersOnly) {
            params.metadataHeaders = [
              "From",
              "Subject",
              "Date",
              "List-Unsubscribe",
              "List-Unsubscribe-Post",
            ];
          }
          const msg = (await gmailApiFetch(`/messages/${msgRef.id}`, params)) as GmailRawMessage;

          emailMessages.push(parseGmailMessage(msg));
          onProgress?.(emailMessages.length, estimatedTotal);
        } catch (err) {
          console.error(`Failed to fetch message ${msgRef.id}:`, err);
        }
      }

      return {
        messages: emailMessages,
        nextPageToken: listResult.nextPageToken,
      };
    },

    async getMessage(messageId: string): Promise<EmailMessage> {
      const msg = (await gmailApiFetch(`/messages/${messageId}`, {
        format: "full",
      })) as GmailRawMessage;

      return parseGmailMessage(msg);
    },

    async trashMessage(messageId: string): Promise<void> {
      await gmailApiPost(`/messages/${messageId}/trash`);
    },

    async markAsSpam(messageId: string): Promise<void> {
      await gmailApiPost(`/messages/${messageId}/modify`, {
        addLabelIds: ["SPAM"],
        removeLabelIds: ["INBOX"],
      });
    },

    async markAsRead(messageId: string, isRead: boolean): Promise<void> {
      if (isRead) {
        await gmailApiPost(`/messages/${messageId}/modify`, {
          removeLabelIds: ["UNREAD"],
        });
      } else {
        await gmailApiPost(`/messages/${messageId}/modify`, {
          addLabelIds: ["UNREAD"],
        });
      }
    },

    async getCurrentSyncCheckpoint(): Promise<string | undefined> {
      try {
        const profile = (await gmailApiFetch("/profile")) as { historyId?: string };
        return profile.historyId;
      } catch {
        return undefined;
      }
    },

    async listChanges(checkpoint: string): Promise<{
      addedIds: string[];
      deletedIds: string[];
      nextCheckpoint: string;
    } | null> {
      const addedIds = new Set<string>();
      const deletedIds = new Set<string>();
      let pageToken: string | undefined;
      let nextCheckpoint = checkpoint;

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const params: Record<string, string> = {
            startHistoryId: checkpoint,
            labelId: "INBOX",
          };
          if (pageToken) params.pageToken = pageToken;

          const result = (await gmailApiFetch("/history", params)) as GmailHistoryResponse;

          // Always update to the latest historyId returned, even if history array is empty
          nextCheckpoint = result.historyId;

          for (const entry of result.history ?? []) {
            for (const item of entry.messagesAdded ?? []) {
              addedIds.add(item.message.id);
              deletedIds.delete(item.message.id);
            }
            for (const item of entry.messagesDeleted ?? []) {
              deletedIds.add(item.message.id);
              addedIds.delete(item.message.id);
            }
          }

          if (result.nextPageToken) {
            pageToken = result.nextPageToken;
          } else {
            break;
          }
        }
      } catch (err) {
        // Gmail returns 404 when the historyId is too old (typically > 7 days of inactivity)
        if (err instanceof Error && err.message.includes("404")) return null;
        throw err;
      }

      return {
        addedIds: Array.from(addedIds),
        deletedIds: Array.from(deletedIds),
        nextCheckpoint,
      };
    },

    async disconnect(): Promise<void> {
      // Nothing to clean up for Gmail API
    },
  };
}
