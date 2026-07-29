// Provider plumbing shared by Gmail, Microsoft and IMAP: the OAuth loopback
// server and outbound RFC 5322 message building. Reading meaning out of a
// message — unsubscribe targets, message type, body text — belongs to
// @paperweight/analysis and happens where each provider parses.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { IPC } from "@shared/ipc";

export function friendlyConnectionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (/self.signed cert/i.test(msg)) {
    return 'Invalid server certificate. Try toggling "Self-signed cert".';
  }
  if (/WRONG_VERSION_NUMBER/i.test(msg)) {
    return 'TLS handshake failed. Try toggling "Implicit TLS".';
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `Connection refused at ${msg.match(/\d+\.\d+\.\d+\.\d+:\d+/)?.[0] ?? "the specified host/port"}. Check the mail server.`;
  }
  if (/ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return "Could not reach the mail server. Check the host and port.";
  }
  if (/authenticate|login|credentials|invalid|Command failed/i.test(msg)) {
    return "Authentication failed. Check your username and password.";
  }
  if (
    /Failed to refresh access token|invalid_grant|token.*expired|token.*revoked/i.test(
      msg,
    )
  ) {
    return "Authorization expired. Reconnect your account to continue syncing.";
  }

  return msg;
}

// --- OAuth loopback server ---
//
// Shared by Gmail and Microsoft providers. Spins up a one-shot local HTTP server
// on a random port, opens the browser to the auth URL, and resolves with the
// authorization code once the provider redirects back.
//
// redirectUriBase: protocol + host used as the redirect_uri (e.g. "http://127.0.0.1"
//   for Gmail, "http://localhost" for Microsoft — Azure requires the localhost form).
// buildAuthUrl: called with the full redirectUri (base + port), returns the URL to open.
// openInBrowser: when true (default) the auth URL is opened in the system browser; when
//   false it is copied to the clipboard instead, so the user can paste it into the
//   browser profile holding the account they want to connect. The URL is always emitted
//   to the renderer (IPC.authUrl) so it can offer copy/open affordances on either path.

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function runLoopbackAuth(
  redirectUriBase: string,
  buildAuthUrl: (redirectUri: string) => string,
  openInBrowser = true
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
  <p>${escapeHtml(errorDescription || error || "Unknown error")}</p>
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
      const authUrl = buildAuthUrl(redirectUri);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shell, clipboard, BrowserWindow } =
        require("electron") as typeof import("electron");

      // Surface the URL to the renderer so the connect screen can offer
      // "open in browser" / "copy link" for the current attempt's live URL.
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.authUrl, authUrl);
      }

      if (openInBrowser) {
        shell.openExternal(authUrl);
      } else {
        clipboard.writeText(authUrl);
      }
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out"));
    }, 5 * 60 * 1000);
  });
}

// Build a minimal RFC 5322 message. Date/Message-ID are intentionally omitted —
// Gmail's messages.send adds them server-side. Headers are RFC 2047 encoded
// when they contain non-ASCII (e.g. "Désinscrire"). Body uses 8bit transfer
// encoding when non-ASCII; receivers supporting 8BITMIME (effectively all
// modern hosts) accept this. Subject and body must already be UTF-8 strings.
export function buildRfc822Message(
  from: string,
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): string {
  const isAscii = (s: string): boolean => /^[\x00-\x7F]*$/.test(s);
  const encodeHeader = (s: string): string =>
    isAscii(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;

  const transferEncoding = isAscii(body) ? "7bit" : "8bit";

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Transfer-Encoding: ${transferEncoding}`,
    "",
    body,
  ];
  return lines.join("\r\n");
}
