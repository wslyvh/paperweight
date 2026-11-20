import { vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), error: vi.fn() }));
vi.mock("./settings", () => ({ requirePro: vi.fn() }));
vi.mock("../providers/ProviderFactory", () => ({ getProvider: async () => ({ type: "imap", sendEmail: mocks.send }) }));
vi.mock("../utils/log", () => ({ actionLog: { info: vi.fn(), error: mocks.error } }));
import { sendEmail } from "./email";

it("redacts the recipient echoed in an SMTP rejection while preserving diagnostics", async () => {
  const recipient = "unsubscribe+personal-token@example.test";
  const message = `Can't send mail - all recipients were rejected: 550 5.1.1 <${recipient}>: Recipient address rejected`;
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at SMTPConnection.send (/home/dev/paperweight/smtp.js:12:3)`;
  const originalStack = error.stack;
  mocks.send.mockRejectedValueOnce(error);

  await expect(sendEmail(recipient, "Subject", "Body")).resolves.toMatchObject({ success: false, error: message });
  expect(mocks.error).toHaveBeenCalledWith(
    "Send email via <example.test> failed: Error: Can't send mail - all recipients were rejected: 550 5.1.1 <[recipient]>: Recipient address rejected\n    at SMTPConnection.send (/home/dev/paperweight/smtp.js:12:3)",
  );
  expect(error.stack).toBe(originalStack);
});
