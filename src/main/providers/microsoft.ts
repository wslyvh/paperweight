import { createHash, randomBytes } from "node:crypto";
import type { EmailProvider, EmailMessage, EmailConnection } from "./types";
import { loadCredentials, saveCredentials } from "../credentials";
import { resolveUnsubscribe, runLoopbackAuth } from "./utils";

// Injected at build time via electron-vite define.
// Set MICROSOFT_CLIENT_ID env var before building.
declare const __MICROSOFT_CLIENT_ID__: string;
const CLIENT_ID = __MICROSOFT_CLIENT_ID__;

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";

// All scopes requested upfront — no re-auth step needed (unlike Gmail readonly→modify).
const SCOPES = "offline_access openid profile User.Read Mail.ReadWrite Mail.Send";

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// --- OAuth ---

export async function startMicrosoftLoopbackAuth(): Promise<{
  success: boolean;
  error?: string;
}> {
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
      }
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
    // friendlyConnectionError in sync.ts matches this string.
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

async function graphGet(url: string, extraHeaders?: Record<string, string>): Promise<unknown> {
  const token = await getValidAccessToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error (${response.status}): ${text}`);
  }

  return response.json();
}

async function graphPost(url: string, body: Record<string, unknown>): Promise<unknown> {
  const token = await getValidAccessToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error (${response.status}): ${text}`);
  }

  return response.json();
}

async function graphPatch(url: string, body: Record<string, unknown>): Promise<void> {
  const token = await getValidAccessToken();
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error (${response.status}): ${text}`);
  }
}

// --- Message parsing ---

interface GraphHeader {
  name: string;
  value: string;
}

interface GraphMessage {
  id: string;
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

function parseGraphMessage(msg: GraphMessage): EmailMessage {
  const getHeader = (name: string): string | undefined =>
    msg.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    )?.value;

  const senderEmail = msg.from?.emailAddress?.address?.toLowerCase() || "";
  const senderName = msg.from?.emailAddress?.name || "";
  const subject = msg.subject || "";
  const listUnsub = getHeader("List-Unsubscribe");
  const listUnsubPost = getHeader("List-Unsubscribe-Post");

  const bodyHtml =
    msg.body?.contentType === "html" ? msg.body.content : undefined;
  const bodyText =
    msg.body?.contentType === "text" ? msg.body.content : undefined;

  const bodyPreview = (bodyText || (bodyHtml?.replace(/<[^>]*>/g, " ") ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150) || msg.bodyPreview?.substring(0, 150) || "";

  const rawHeaders = Object.fromEntries(
    (msg.internetMessageHeaders || []).map((h) => [h.name, h.value])
  );

  const unsub = resolveUnsubscribe(listUnsub, listUnsubPost, bodyHtml, subject);

  return {
    id: msg.id,
    date: new Date(msg.receivedDateTime).getTime(),
    subject,
    snippet: msg.bodyPreview?.substring(0, 150) || "",
    bodyPreview,
    senderEmail,
    senderName,
    unsubscribeUrl: unsub?.url,
    unsubscribeMethod: unsub?.method ?? "none",
    headersJson: JSON.stringify(rawHeaders),
    sizeBytes: msg.body?.content?.length ?? 0,
  };
}

// --- Provider ---

export function createMicrosoftProvider(): EmailProvider {
  return {
    type: "microsoft",

    async connect(): Promise<EmailConnection> {
      const profile = (await graphGet(
        `${GRAPH_BASE}?$select=mail,userPrincipalName`
      )) as { mail?: string; userPrincipalName?: string };

      return {
        type: "microsoft-oauth",
        email: profile.mail || profile.userPrincipalName || "",
        canRead: true,
        canModify: true,
        canSend: false,
      };
    },

    isAuthenticated(): boolean {
      return !!loadCredentials()?.microsoft?.accessToken;
    },

    async getMessageCount(since: Date, until?: Date): Promise<number | undefined> {
      try {
        const filterParts = [`receivedDateTime ge ${since.toISOString()}`];
        if (until) filterParts.push(`receivedDateTime lt ${until.toISOString()}`);

        const url = new URL(`${GRAPH_BASE}/messages`);
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
      onProgress?: (fetched: number, estimatedTotal?: number) => void,
      headersOnly?: boolean
    ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
      // pageToken is the full @odata.nextLink URL from the previous page.
      let listUrl: string;

      if (pageToken) {
        listUrl = pageToken;
      } else {
        const filterParts = [`receivedDateTime ge ${since.toISOString()}`];
        if (until) filterParts.push(`receivedDateTime lt ${until.toISOString()}`);

        const url = new URL(`${GRAPH_BASE}/messages`);
        url.searchParams.set("$select", "id,receivedDateTime,from,subject,bodyPreview");
        url.searchParams.set("$top", "50");
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

      const emailMessages: EmailMessage[] = [];

      for (const msgRef of listResult.value) {
        try {
          // headersOnly: fetch internetMessageHeaders + metadata but skip body.
          // Equivalent to Gmail's format=metadata — List-Unsubscribe is available,
          // footer link extraction is not (no body). Body is the largest part of the
          // response, so omitting it keeps historical sync fast.
          const select = headersOnly
            ? "id,receivedDateTime,from,subject,bodyPreview,internetMessageHeaders"
            : "id,receivedDateTime,from,subject,bodyPreview,body,internetMessageHeaders";

          const msg = (await graphGet(
            `${GRAPH_BASE}/messages/${msgRef.id}?$select=${select}`
          )) as GraphMessage;

          emailMessages.push(parseGraphMessage(msg));
          onProgress?.(emailMessages.length);
        } catch (err) {
          console.error(`Failed to fetch message ${msgRef.id}:`, err);
        }
      }

      return {
        messages: emailMessages,
        nextPageToken: listResult["@odata.nextLink"],
      };
    },

    async getMessage(messageId: string): Promise<EmailMessage> {
      const msg = (await graphGet(
        `${GRAPH_BASE}/messages/${messageId}?$select=id,receivedDateTime,from,subject,bodyPreview,body,internetMessageHeaders`
      )) as GraphMessage;

      return parseGraphMessage(msg);
    },

    async trashMessage(messageId: string): Promise<void> {
      await graphPost(`${GRAPH_BASE}/messages/${messageId}/move`, {
        destinationId: "deleteditems",
      });
    },

    async markAsSpam(messageId: string): Promise<void> {
      await graphPost(`${GRAPH_BASE}/messages/${messageId}/move`, {
        destinationId: "junkemail",
      });
    },

    async markAsRead(messageId: string, isRead: boolean): Promise<void> {
      await graphPatch(`${GRAPH_BASE}/messages/${messageId}`, { isRead });
    },

    // --- Checkpoint sync (Graph Delta Query) ---
    //
    // Checkpoint is the full @odata.deltaLink URL returned by the Graph delta endpoint.
    // On first run: $deltaToken=latest gives a deltaLink representing "now" with no data transfer.
    // On subsequent runs: iterate from deltaLink — only changed messages (added + @removed) returned.
    // Any error (expired token, too many changes) → return null → caller falls back to date-based.

    async getCurrentSyncCheckpoint(): Promise<string | undefined> {
      try {
        // $deltaToken=latest returns an empty page with just the deltaLink immediately —
        // no need to paginate through the entire mailbox.
        const url = new URL(`${GRAPH_BASE}/messages/delta`);
        url.searchParams.set("$deltaToken", "latest");
        url.searchParams.set("$select", "id");

        const result = (await graphGet(url.toString())) as {
          "@odata.deltaLink"?: string;
        };
        return result["@odata.deltaLink"] ?? undefined;
      } catch {
        return undefined;
      }
    },

    async listChanges(checkpoint: string): Promise<{
      addedIds: string[];
      deletedIds: string[];
      nextCheckpoint: string;
    } | null> {
      try {
        const addedIds: string[] = [];
        const deletedIds: string[] = [];
        let nextLink: string | undefined = checkpoint;
        let deltaLink = checkpoint;

        while (nextLink) {
          const result = (await graphGet(nextLink)) as {
            value?: Array<{ id: string; "@removed"?: unknown }>;
            "@odata.nextLink"?: string;
            "@odata.deltaLink"?: string;
          };

          for (const item of result.value ?? []) {
            if (item["@removed"]) {
              deletedIds.push(item.id);
            } else {
              addedIds.push(item.id);
            }
          }

          if (result["@odata.nextLink"]) {
            nextLink = result["@odata.nextLink"];
          } else {
            deltaLink = result["@odata.deltaLink"] ?? checkpoint;
            nextLink = undefined;
          }
        }

        return { addedIds, deletedIds, nextCheckpoint: deltaLink };
      } catch {
        // Expired or invalidated delta token → fall back to date-based sync
        return null;
      }
    },

    async disconnect(): Promise<void> {
      // Nothing to clean up for Graph API
    },
  };
}
