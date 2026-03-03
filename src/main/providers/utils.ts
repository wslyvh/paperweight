// Extract a usable unsubscribe URL from email headers and/or HTML body.
//
// Priority:
//   1. RFC 8058 One-Click (List-Unsubscribe-Post + HTTPS in List-Unsubscribe)
//   2. List-Unsubscribe header (HTTPS > HTTP > mailto)
//   3. Footer unsubscribe link from HTML body
//
// Returns { url, method } or undefined.

import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  UNSUBSCRIBE_LINK_TEXT,
  UNSUBSCRIBE_URL_PATTERNS,
} from "@shared/languages";

// --- OAuth loopback server ---
//
// Shared by Gmail and Microsoft providers. Spins up a one-shot local HTTP server
// on a random port, opens the browser to the auth URL, and resolves with the
// authorization code once the provider redirects back.
//
// redirectUriBase: protocol + host used as the redirect_uri (e.g. "http://127.0.0.1"
//   for Gmail, "http://localhost" for Microsoft — Azure requires the localhost form).
// buildAuthUrl: called with the full redirectUri (base + port), returns the URL to open.

export function runLoopbackAuth(
  redirectUriBase: string,
  buildAuthUrl: (redirectUri: string) => string
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = "";

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        code
          ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paperweight — Connected</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #2a303c;
      color: #a6adbb;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      text-align: center;
    }
    .stone {
      font-size: 80px;
      animation: nod 1.2s ease-in-out 0.3s 2;
      display: inline-block;
    }
    @keyframes nod {
      0%   { transform: rotate(0deg); }
      20%  { transform: rotate(-8deg); }
      40%  { transform: rotate(8deg); }
      60%  { transform: rotate(-5deg); }
      80%  { transform: rotate(3deg); }
      100% { transform: rotate(0deg); }
    }
    h2 { font-size: 18px; font-weight: 600; color: #e2e8f0; }
    p  { font-size: 13px; color: #a6adbb; }
  </style>
</head>
<body>
  <div class="stone">🗿</div>
  <h2>You're in.</h2>
  <p>You can close this tab.</p>
</body>
</html>`
          : `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paperweight — Authorization Failed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #2a303c;
      color: #a6adbb;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      text-align: center;
    }
    .stone { font-size: 80px; }
    h2 { font-size: 18px; font-weight: 600; color: #e2e8f0; }
    p  { font-size: 13px; color: #a6adbb; }
  </style>
</head>
<body>
  <div class="stone">🗿</div>
  <h2>Authorization failed.</h2>
  <p>${errorDescription || error || "Unknown error"}</p>
</body>
</html>`
      );

      server.close();

      if (code) {
        resolve({ code, redirectUri });
      } else {
        reject(new Error(error || "Authorization was denied or failed"));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `${redirectUriBase}:${port}`;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shell } = require("electron") as typeof import("electron");
      shell.openExternal(buildAuthUrl(redirectUri));
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out"));
    }, 5 * 60 * 1000);
  });
}

export type UnsubscribeMethod = "rfc8058" | "list-unsubscribe" | "footer" | "none";

export interface UnsubscribeResult {
  url: string;
  method: Exclude<UnsubscribeMethod, "none">;
}

// --- RFC 8058 One-Click detection ---

function isOneClickPost(header: string): boolean {
  return /List-Unsubscribe\s*=\s*One-Click/i.test(header);
}

// --- List-Unsubscribe header parsing (RFC 2369) ---

function parseListUnsubscribeHeader(raw: string): string | undefined {
  const urls = raw.match(/<([^>]+)>/g)?.map((u) => u.slice(1, -1)) || [raw];

  const httpsUrl = urls.find((u) => u.startsWith("https://"));
  if (httpsUrl) return httpsUrl;

  const httpUrl = urls.find((u) => u.startsWith("http://"));
  if (httpUrl) return httpUrl;

  const mailtoUrl = urls.find((u) => u.startsWith("mailto:"));
  if (mailtoUrl) return mailtoUrl;

  return undefined;
}

// --- HTML body footer link extraction ---

// Match <a> tags, capturing href and inner text.
// Handles attributes in any order, single/double quotes.
const A_TAG_RE = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function extractFooterUnsubscribeLink(html: string): string | undefined {
  // Only scan the last ~20% of the HTML (footer area) to reduce false positives.
  // Most unsubscribe links live in the email footer.
  const footerStart = Math.floor(html.length * 0.8);
  const footer = html.substring(footerStart);

  // First pass: match link text against unsubscribe terms
  let match: RegExpExecArray | null;
  A_TAG_RE.lastIndex = 0;
  while ((match = A_TAG_RE.exec(footer)) !== null) {
    const href = match[1];
    const linkText = match[2].replace(/<[^>]*>/g, "").trim(); // Strip nested tags

    if (!href.startsWith("http")) continue;

    // Check if the link text matches unsubscribe terms
    if (UNSUBSCRIBE_LINK_TEXT.some((p) => p.test(linkText))) {
      return href;
    }
  }

  // Second pass: check if URL itself contains unsubscribe path segments
  A_TAG_RE.lastIndex = 0;
  while ((match = A_TAG_RE.exec(footer)) !== null) {
    const href = match[1];
    if (!href.startsWith("http")) continue;

    if (UNSUBSCRIBE_URL_PATTERNS.some((p) => p.test(href))) {
      return href;
    }
  }

  return undefined;
}

// --- Forwarded message detection ---

// Common forwarding prefixes across email clients and languages.
// Intentionally excludes very short/ambiguous prefixes like "I:" (Italian).
const FORWARDED_SUBJECT_RE = /^\s*(fwd?|wg|wtr|tr|rv)\s*:/i;

function isForwardedSubject(subject: string): boolean {
  return FORWARDED_SUBJECT_RE.test(subject);
}

// --- Public API ---

export function resolveUnsubscribe(
  listUnsubscribeHeader?: string,
  listUnsubscribePostHeader?: string,
  bodyHtml?: string,
  subject?: string
): UnsubscribeResult | undefined {
  // Priority 1: RFC 8058 One-Click
  if (listUnsubscribeHeader && listUnsubscribePostHeader && isOneClickPost(listUnsubscribePostHeader)) {
    const httpsUrl = parseListUnsubscribeHeader(listUnsubscribeHeader);
    if (httpsUrl && httpsUrl.startsWith("https://")) {
      return { url: httpsUrl, method: "rfc8058" };
    }
  }

  // Priority 2: List-Unsubscribe header (RFC 2369)
  if (listUnsubscribeHeader) {
    const headerUrl = parseListUnsubscribeHeader(listUnsubscribeHeader);
    if (headerUrl) return { url: headerUrl, method: "list-unsubscribe" };
  }

  // Priority 3: Footer link from HTML body
  if (bodyHtml && (!subject || !isForwardedSubject(subject))) {
    const footerUrl = extractFooterUnsubscribeLink(bodyHtml);
    if (footerUrl) return { url: footerUrl, method: "footer" };
  }

  return undefined;
}

/** @deprecated Use resolveUnsubscribe for url + method */
export function resolveUnsubscribeUrl(
  listUnsubscribeHeader?: string,
  bodyHtml?: string,
  subject?: string
): string | undefined {
  const result = resolveUnsubscribe(listUnsubscribeHeader, undefined, bodyHtml, subject);
  return result?.url;
}
