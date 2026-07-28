import { createHash, randomBytes } from "node:crypto";
import type { EmailProvider, EmailMessage, EmailConnection } from "./types";
import { loadCredentials, saveCredentials } from "../credentials";
import { runLoopbackAuth } from "./utils";
import { analyzeMessage } from "@paperweight/analysis";
import type { AnalyzeOptions, RawMessage } from "@paperweight/analysis";
import { BODY_TEXT_MAX_LENGTH } from "@shared/config";
import { headerRecord } from "@shared/utils";
import { syncLog, authLog } from "../utils/log";

// Injected at build time via electron-vite define.
// Set MICROSOFT_CLIENT_ID env var before building.
declare const __MICROSOFT_CLIENT_ID__: string;
const CLIENT_ID = __MICROSOFT_CLIENT_ID__;

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_ME_BASE = `${GRAPH_API_BASE}/me`;

const SCOPES = "offline_access openid profile User.Read Mail.ReadWrite Mail.Send";

// Request immutable IDs on every Graph call. Default Graph message IDs change when a message
// moves between folders; immutable IDs stay stable for the message's lifetime in the mailbox,
// giving a reliable handle across folder moves and syncs. The header is per-request, so it
// must be sent on every call (list, get, batch, move, patch). Stored message IDs are therefore
// in immutable format. (Containers like mailFolders don't have immutable IDs — their regular
// IDs were always constant — so parentFolderId comparisons are unaffected.)
const IMMUTABLE_ID_HEADER: Record<string, string> = {
  Prefer: 'IdType="ImmutableId"',
};

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// --- OAuth ---

export async function startMicrosoftLoopbackAuth(openInBrowser = true): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!CLIENT_ID) {
    authLog.error("Microsoft auth aborted: MICROSOFT_CLIENT_ID not set at build time");
    return {
      success: false,
      error: "Missing env variables: MICROSOFT_CLIENT_ID. See README for setup instructions.",
    };
  }
  try {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const { code, redirectUri } = await runLoopbackAuth(
      // Azure requires "localhost" (not 127.0.0.1) to match the registered redirect URI.
      "http://localhost",
      (redirectUri) => {
        const authUrl = new URL(MS_AUTH_URL);
        authUrl.searchParams.set("client_id", CLIENT_ID);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", SCOPES);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("response_mode", "query");
        return authUrl.toString();
      },
      openInBrowser
    );

    const response = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: SCOPES,
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
        providerType: "microsoft",
        microsoft: {
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
  if (!creds?.microsoft) throw new Error("No Microsoft credentials stored");

  if (Date.now() < creds.microsoft.expiresAt - 60_000) {
    return creds.microsoft.accessToken;
  }

  const response = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: creds.microsoft.refreshToken,
      scope: SCOPES,
    }),
  });

  const data = await response.json();

  if (data.error) {
    // invalid_grant = refresh token expired (90 days inactivity).
    // friendlyConnectionError matches this string.
    throw new Error(
      `Failed to refresh access token: ${data.error} ${data.error_description || ""}`.trim()
    );
  }

  if (data.access_token) {
    creds.microsoft.accessToken = data.access_token;
    creds.microsoft.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    if (data.refresh_token) creds.microsoft.refreshToken = data.refresh_token;
    saveCredentials(creds);
    return data.access_token;
  }

  throw new Error("Failed to refresh Microsoft access token: no token in response");
}

// --- Graph API helpers ---

const GRAPH_MAX_RETRIES = 4;

// Returns how many ms to wait before the next retry.
// Prefers the Retry-After header; falls back to exponential backoff.
function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  return Math.min(2 ** attempt * 1000, 30_000);
}

async function graphGet(url: string, extraHeaders?: Record<string, string>): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const token = await getValidAccessToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ...IMMUTABLE_ID_HEADER, ...extraHeaders },
    });

    if (response.status === 429 && attempt < GRAPH_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, retryDelayMs(response, attempt)));
      attempt++;
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API error (${response.status}): ${text}`);
    }

    return response.json();
  }
}

async function graphPost(url: string, body: Record<string, unknown>): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const token = await getValidAccessToken();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...IMMUTABLE_ID_HEADER,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < GRAPH_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, retryDelayMs(response, attempt)));
      attempt++;
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API error (${response.status}): ${text}`);
    }

    return response.json();
  }
}

async function graphPatch(url: string, body: Record<string, unknown>): Promise<void> {
  let attempt = 0;
  while (true) {
    const token = await getValidAccessToken();
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...IMMUTABLE_ID_HEADER,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < GRAPH_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, retryDelayMs(response, attempt)));
      attempt++;
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API error (${response.status}): ${text}`);
    }

    return;
  }
}

// --- Message parsing ---

interface GraphHeader {
  name: string;
  value: string;
}

interface GraphMessage {
  id: string;
  parentFolderId?: string;
  receivedDateTime: string;
  subject?: string;
  bodyPreview?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  body?: {
    contentType: "html" | "text";
    content: string;
  };
  internetMessageHeaders?: GraphHeader[];
}

interface GraphBatchResponse {
  responses?: Array<{
    id: string;
    status: number;
    body?: GraphMessage;
  }>;
}

async function graphBatchGetMessages(
  messageIds: string[],
  select: string
): Promise<GraphMessage[]> {
  if (messageIds.length === 0) return [];

  // Microsoft Graph $batch supports up to 20 requests per batch.
  const requests = messageIds.map((messageId, index) => ({
    id: String(index),
    method: "GET",
    url: `/me/messages/${messageId}?$select=${select}`,
    // Per-request header — each $batch sub-request must opt into immutable IDs itself.
    headers: IMMUTABLE_ID_HEADER,
  }));

  // Retry the whole batch if any per-response status is 429.
  let attempt = 0;
  while (true) {
    const result = (await graphPost(`${GRAPH_API_BASE}/$batch`, {
      requests,
    })) as GraphBatchResponse;

    const responses = result.responses ?? [];
    const throttled = responses.filter((r) => r.status === 429);

    if (throttled.length === 0) {
      return responses
        .filter(
          (item): item is { id: string; status: number; body: GraphMessage } =>
            item.status >= 200 && item.status < 300 && !!item.body
        )
        .map((item) => item.body);
    }

    if (attempt >= GRAPH_MAX_RETRIES) {
      // Return whatever succeeded rather than failing entirely.
      return responses
        .filter(
          (item): item is { id: string; status: number; body: GraphMessage } =>
            item.status >= 200 && item.status < 300 && !!item.body
        )
        .map((item) => item.body);
    }

    // Back off based on attempt number (no Retry-After in batch sub-responses).
    await new Promise((r) =>
      setTimeout(r, Math.min(2 ** attempt * 1000, 30_000))
    );
    attempt++;
  }
}

async function parseGraphMessage(
  msg: GraphMessage,
  analysisOptions?: AnalyzeOptions,
): Promise<EmailMessage> {
  const bodyHtml =
    msg.body?.contentType === "html" ? msg.body.content : undefined;
  const bodyText =
    msg.body?.contentType === "text" ? msg.body.content : undefined;

  // Lossless: ordered [name, value] pairs, duplicates preserved. The same pairs
  // feed the engine, so stored headers and analyzed headers can't diverge.
  const pairs = (msg.internetMessageHeaders || []).map(
    (h): [string, string] => [h.name, h.value],
  );
  const raw: RawMessage = { headers: headerRecord(pairs) };
  if (bodyText) raw.text = bodyText;
  if (bodyHtml) raw.html = bodyHtml;
  const analysis = await analyzeMessage(raw, {
    ...analysisOptions,
    maxTextLength: BODY_TEXT_MAX_LENGTH,
  });

  return {
    id: msg.id,
    date: new Date(msg.receivedDateTime).getTime(),
    subject: msg.subject || "",
    snippet: msg.bodyPreview?.substring(0, 150) || "",
    senderEmail: msg.from?.emailAddress?.address?.toLowerCase() || "",
    senderName: msg.from?.emailAddress?.name || "",
    headersJson: JSON.stringify(pairs),
    sizeBytes: msg.body?.content?.length ?? 0,
    analysis,
    bodyTruncated: analysis.textTruncated || undefined,
  };
}

export async function fetchMicrosoftProfileEmail(accessToken: string): Promise<string | undefined> {
  try {
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      authLog.error(`Microsoft profile fetch failed (${resp.status}): ${body}`);
      return undefined;
    }
    const profile = (await resp.json()) as { mail?: string; userPrincipalName?: string };
    const email = profile.mail || profile.userPrincipalName;
    if (!email) {
      authLog.error("Microsoft profile response missing mail and userPrincipalName");
    }
    return email;
  } catch (err) {
    authLog.error("Microsoft profile fetch threw:", err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

// --- Provider ---

export function createMicrosoftProvider(
  analysisOptions?: AnalyzeOptions,
): EmailProvider {
  // Folders excluded from the all-mail scan (Junk/Deleted/Sent/Drafts). Resolved once per
  // sync session and cached. /me/messages spans every folder, so we filter by parentFolderId.
  let excludedFolderIds: Set<string> | undefined;

  async function getExcludedFolderIds(): Promise<Set<string>> {
    if (excludedFolderIds) return excludedFolderIds;
    const ids = new Set<string>();
    for (const name of ["junkemail", "deleteditems", "sentitems", "drafts"]) {
      try {
        const folder = (await graphGet(
          `${GRAPH_ME_BASE}/mailFolders/${name}?$select=id`
        )) as { id?: string };
        if (folder.id) ids.add(folder.id);
      } catch {
        // Folder may not exist on this mailbox — ignore.
      }
    }
    // Only cache a non-empty result. If every lookup failed (transient error), retry next
    // call rather than caching an empty set that would let Junk/Deleted/Sent/Drafts through
    // for the rest of the sync session.
    if (ids.size > 0) excludedFolderIds = ids;
    return ids;
  }

  return {
    type: "microsoft",

    async connect(): Promise<EmailConnection> {
      const profile = (await graphGet(
        `${GRAPH_ME_BASE}?$select=mail,userPrincipalName`
      )) as { mail?: string; userPrincipalName?: string };

      return {
        type: "microsoft-oauth",
        email: profile.mail || profile.userPrincipalName || "",
      };
    },

    isAuthenticated(): boolean {
      return !!loadCredentials()?.microsoft?.accessToken;
    },

    async getMessageCount(since: Date, until?: Date): Promise<number | undefined> {
      try {
        const filterParts = [`receivedDateTime ge ${since.toISOString()}`];
        if (until) filterParts.push(`receivedDateTime lt ${until.toISOString()}`);

        // All folders (not just inbox). This is a progress-bar estimate only, never used for
        // correctness. It does NOT apply the Junk/Deleted/Sent/Drafts exclusion the listing
        // does (there's no cheap server-side count for "all mail minus these folders"), so with
        // a large Sent/Trash the total can run well above the messages actually processed — the
        // bar may stall below 100%. Acceptable for an estimate; revisit if it misleads users.
        const url = new URL(`${GRAPH_ME_BASE}/messages`);
        url.searchParams.set("$count", "true");
        url.searchParams.set("$filter", filterParts.join(" and "));
        url.searchParams.set("$top", "1");
        url.searchParams.set("$select", "id");

        const result = (await graphGet(url.toString(), {
          "ConsistencyLevel": "eventual",
        })) as { "@odata.count"?: number };

        return result["@odata.count"];
      } catch {
        return undefined;
      }
    },

    async listMessages(
      since: Date,
      until?: Date,
      pageToken?: string,
      onProgress?: (fetched: number, estimatedTotal?: number) => void
    ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
      // pageToken is the full @odata.nextLink URL from the previous page.
      let listUrl: string;

      if (pageToken) {
        listUrl = pageToken;
      } else {
        const filterParts = [`receivedDateTime ge ${since.toISOString()}`];
        if (until) filterParts.push(`receivedDateTime lt ${until.toISOString()}`);

        // All folders (not just inbox). parentFolderId lets us drop Junk/Deleted/Sent/Drafts.
        const url = new URL(`${GRAPH_ME_BASE}/messages`);
        url.searchParams.set("$select", "id,parentFolderId,receivedDateTime,from,subject,bodyPreview");
        url.searchParams.set("$top", "100");
        url.searchParams.set("$filter", filterParts.join(" and "));
        listUrl = url.toString();
      }

      const listResult = (await graphGet(listUrl)) as {
        value?: Array<GraphMessage>;
        "@odata.nextLink"?: string;
      };

      if (!listResult.value || listResult.value.length === 0) {
        return { messages: [] };
      }

      // Exclude Junk/Deleted/Sent/Drafts (Spam/Trash are never synced; Sent/Drafts are
      // self-authored and dropped downstream anyway — skip them here to save bandwidth).
      const excluded = await getExcludedFolderIds();
      const candidates = listResult.value.filter(
        (m) => !m.parentFolderId || !excluded.has(m.parentFolderId)
      );

      if (candidates.length === 0) {
        return { messages: [], nextPageToken: listResult["@odata.nextLink"] };
      }

      const emailMessages: EmailMessage[] = [];
      const select =
        "id,receivedDateTime,from,subject,bodyPreview,body,internetMessageHeaders";

      const BATCH_SIZE = 20;
      // Small pause between batch calls to avoid hitting the per-app request limit.
      const BATCH_INTER_DELAY_MS = 200;
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, BATCH_INTER_DELAY_MS));
        }
        const chunk = candidates.slice(i, i + BATCH_SIZE);
        const chunkIds = chunk.map((m) => m.id);

        try {
          const batchMessages = await graphBatchGetMessages(chunkIds, select);
          for (const msg of batchMessages) {
            emailMessages.push(await parseGraphMessage(msg, analysisOptions));
            onProgress?.(emailMessages.length);
          }
        } catch (err) {
          syncLog.error("Failed to fetch Microsoft message batch:", err instanceof Error ? err.message : String(err));
        }
      }

      return {
        messages: emailMessages,
        nextPageToken: listResult["@odata.nextLink"],
      };
    },

    async getMessage(messageId: string): Promise<EmailMessage> {
      const msg = (await graphGet(
        `${GRAPH_ME_BASE}/messages/${messageId}?$select=id,receivedDateTime,from,subject,bodyPreview,body,internetMessageHeaders`
      )) as GraphMessage;

      return parseGraphMessage(msg, analysisOptions);
    },

    async trashMessage(messageId: string): Promise<void> {
      await graphPost(`${GRAPH_ME_BASE}/messages/${messageId}/move`, {
        destinationId: "deleteditems",
      });
    },

    async markAsSpam(messageId: string): Promise<void> {
      await graphPost(`${GRAPH_ME_BASE}/messages/${messageId}/move`, {
        destinationId: "junkemail",
      });
    },

    async markAsRead(messageId: string, isRead: boolean): Promise<void> {
      await graphPatch(`${GRAPH_ME_BASE}/messages/${messageId}`, { isRead });
    },

    // Graph's sendMail only allows custom "x-" prefixed internetMessageHeaders,
    // not standard headers like In-Reply-To/References, so inReplyTo is accepted
    // for interface parity but can't be applied here — Outlook mail is sent
    // unthreaded. Proper threading would require the reply/createReply action
    // against the original message's Graph id, which we don't currently store.
    async sendEmail(to: string, subject: string, body: string, _inReplyTo?: string): Promise<string | undefined> {
      const token = await getValidAccessToken();
      const response = await fetch(`${GRAPH_ME_BASE}/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "Text", content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: true,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Graph sendMail failed (${response.status}): ${text}`);
      }
      // sendMail returns 202 with no body, and Exchange assigns the
      // internetMessageId itself — read it back from Sent Items. Best effort:
      // the sent item may not have landed yet.
      try {
        const recent = (await graphGet(
          `${GRAPH_ME_BASE}/mailFolders/sentitems/messages?$top=10&$orderby=sentDateTime desc&$select=subject,internetMessageId,toRecipients`
        )) as {
          value?: Array<{
            subject?: string;
            internetMessageId?: string;
            toRecipients?: Array<{ emailAddress?: { address?: string } }>;
          }>;
        };
        // Match on subject AND recipient: GDPR subjects are identical template
        // strings across vendors, so subject alone would return a different
        // vendor's just-sent request. Results are newest-first, so find() takes
        // the most recent match.
        const target = to.toLowerCase();
        return recent.value?.find(
          (m) =>
            m.subject === subject &&
            m.toRecipients?.some(
              (r) => r.emailAddress?.address?.toLowerCase() === target,
            ),
        )?.internetMessageId;
      } catch {
        return undefined;
      }
    },

    // No removal tracking for Microsoft (adds-only, like IMAP). Graph delta is per-folder
    // only, so an inbox delta's `@removed` can't distinguish "moved to Archive" (still in
    // our all-mail scope — keep) from "deleted/trashed" (remove), and default Graph IDs
    // change on move so we can't re-resolve to disambiguate. Using it would wrongly delete
    // archived mail. Externally-deleted messages therefore linger until a full re-sync —
    // the same limitation IMAP has. Proper deletion handling needs a reconciliation pass
    // (see docs/lessons.md → "Our sync has no deletion reconciliation").

    async disconnect(): Promise<void> {
      // Nothing to clean up for Graph API
    },
  };
}
