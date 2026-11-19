import { vi } from "vitest";
import { loadCredentials } from "../credentials";
import { createImapProvider, testImapConnection } from "./imap";
import { testSmtpConnection } from "./smtp";

const mocks = vi.hoisted(() => ({
  smtpOptions: vi.fn(),
  imapOptions: vi.fn(),
  sendOptions: vi.fn(),
}));

vi.mock("../credentials", () => ({ loadCredentials: vi.fn() }));
vi.mock("../services/settings", () => ({ getSetting: () => undefined }));
vi.mock("../utils/log", () => ({ syncLog: { info: vi.fn(), error: vi.fn() } }));
vi.mock("nodemailer/lib/smtp-connection", () => ({
  default: class {
    allowsAuth = true;
    constructor(options: unknown) { mocks.smtpOptions(options); }
    once() {}
    removeListener() {}
    connect(callback: () => void) { callback(); }
    login(_auth: unknown, callback: () => void) { callback(); }
    quit() {}
  },
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport(options: unknown) {
      mocks.sendOptions(options);
      return { sendMail: async () => ({ messageId: "fixture" }), close() {} };
    },
  },
}));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(options: unknown) { mocks.imapOptions(options); }
    on() {}
    removeListener() {}
    async connect() {}
    async logout() {}
  },
}));

it.each([
  { host: "mail.example.test", tls: false, required: true },
  { host: "mail.example.test", tls: true, required: false },
  { host: "localhost", tls: false, required: true },
  { host: "127.0.0.1", tls: false, required: true },
  { host: "::1", tls: false, required: true },
  { host: "localhost.example.test", tls: false, required: true },
  { host: "192.168.1.10", tls: false, required: true },
])("applies TLS policy to test/send/sync for $host (implicit TLS=$tls)", async ({ host, tls, required }) => {
  vi.clearAllMocks();
  // Self-signed certificate permission must not permit plaintext.
  const config = { host, port: 12345, tls, username: "fixture@example.test", password: "dummy", allowSelfSigned: true };
  vi.mocked(loadCredentials).mockResolvedValue({
    providerType: "imap",
    imap: { ...config, smtp: { host, port: 12346, tls } },
  });

  expect((await testSmtpConnection(config)).success).toBe(true);
  expect((await testImapConnection(config)).success).toBe(true);
  const provider = createImapProvider();
  await provider.connect();
  await provider.sendEmail("recipient@example.test", "Fixture", "Body");
  await provider.disconnect();

  const smtpPolicy = expect.objectContaining({ host, secure: tls, requireTLS: required });
  expect(mocks.smtpOptions).toHaveBeenCalledWith(smtpPolicy);
  expect(mocks.sendOptions).toHaveBeenCalledWith(smtpPolicy);
  expect(mocks.imapOptions).toHaveBeenCalledTimes(2);
  for (const [options] of mocks.imapOptions.mock.calls) {
    expect(options).toEqual(expect.objectContaining({ host, secure: tls, doSTARTTLS: required ? true : undefined }));
  }
});

