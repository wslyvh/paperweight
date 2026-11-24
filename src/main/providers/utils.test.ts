import { simpleParser } from "mailparser";
import { parseMailto } from "../../shared/utils";
import { buildRfc822Message, friendlyConnectionError } from "./utils";
import { isOAuthTokenError } from "../../renderer/components/syncStatus";

describe("connection recovery errors", () => {
  it.each([
    "Failed to refresh access token: invalid_grant Refresh token expired",
    "invalid_grant",
    "Token revoked: invalid credentials",
  ])("keeps OAuth recovery available for %s", (message) => {
    const error = friendlyConnectionError(new Error(message));
    expect(error).toBe("Authorization expired. Reconnect your account to continue syncing.");
    expect(isOAuthTokenError(error)).toBe(true);
  });

  it("preserves password guidance for an IMAP login failure", () => {
    const error = friendlyConnectionError(new Error("LOGIN failed: invalid credentials"));
    expect(error).toBe("Authentication failed. Check your username and password.");
    expect(isOAuthTokenError(error)).toBe(false);
  });
});

describe("buildRfc822Message", () => {
  it.each(["\r", "\n", "\r\n"])("rejects %j in every header input", (newline) => {
    const injected = `value${newline}Bcc: extra@example.test`;
    for (const field of ["from", "to", "subject", "inReplyTo"] as const) {
      const headers = {
        from: "sender@example.test",
        to: "recipient@example.test",
        subject: "Unsubscribe",
        inReplyTo: "<original@example.test>",
        [field]: injected,
      };
      expect(() => buildRfc822Message(
        headers.from, headers.to, headers.subject, "Body", headers.inReplyTo,
      )).toThrow("Email headers cannot contain line breaks.");
    }
  });

  it.each([
    "mailto:unsubscribe@example.test?subject=unsubscribe%0D%0ABcc%3A%20extra%40example.test",
    "mailto:unsubscribe%40example.test%0D%0ABcc%3A%20extra%40example.test?subject=unsubscribe",
  ])("rejects header injection decoded from an unsubscribe link: %s", (url) => {
    const { to, subject, body } = parseMailto(url);
    expect(() => buildRfc822Message("sender@example.test", to, subject, body))
      .toThrow("Email headers cannot contain line breaks.");
  });

  it("preserves Unicode subjects, reply references and multiline bodies", async () => {
    const body = "First line\r\nBcc: body-only@example.test\r\nLast line";
    const raw = buildRfc822Message(
      "sender@example.test", "recipient@example.test", "Désinscrire", body, "<original@example.test>",
    );
    const parsed = await simpleParser(raw);
    expect(parsed.subject).toBe("Désinscrire");
    expect(parsed.inReplyTo).toBe("<original@example.test>");
    expect(parsed.bcc).toBeUndefined();
    expect(raw.endsWith(`\r\n\r\n${body}`)).toBe(true);
  });
});
