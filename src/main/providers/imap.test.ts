// Stub credentials, settings and logging so the pure parse helpers load alone.
jest.mock("../services/settings", () => ({ getSetting: () => undefined }));
jest.mock("../credentials", () => ({ loadCredentials: () => undefined }));
jest.mock("../utils/log", () => ({
  syncLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// The real engine imports ESM (htmlparser2/franc) the CJS jest runner can't
// load. What it decides — body selection, type, unsubscribe — is covered by the
// analysis vitest suite. What matters here is the handoff: which inputs the
// provider builds out of a raw IMAP message, so the mock records them.
jest.mock("@paperweight/analysis", () => ({
  analyzeMessage: jest.fn(),
}));

import { simpleParser } from "mailparser";
import { analyzeMessage } from "@paperweight/analysis";
import type { Analysis, RawMessage } from "@paperweight/analysis";
import { buildHeaderPairs, parseImapMessage } from "./imap";

const mockAnalyze = analyzeMessage as jest.MockedFunction<typeof analyzeMessage>;

const ANALYSIS: Analysis = {
  version: "test-v1",
  lang: "eng",
  findings: [],
  text: "the analyzed body",
  type: "promotion",
  typeConfidence: 0.8,
  typeSignals: [],
  unsubscribe: { method: "list-unsubscribe", target: "https://acme.com/u" },
};

beforeEach(() => {
  mockAnalyze.mockReset();
  mockAnalyze.mockResolvedValue(ANALYSIS);
});

const raw = (lines: string[]): Buffer => Buffer.from(lines.join("\r\n"));

// The RawMessage the provider handed the engine for the last parsed message.
const handedOver = (): RawMessage => mockAnalyze.mock.calls[0][0];

describe("buildHeaderPairs — lossless capture", () => {
  it("preserves duplicate headers and keeps List-* present", async () => {
    const parsed = await simpleParser(
      raw([
        "Received: from mx1.acme.com",
        "Received: from mx2.acme.com",
        "From: Acme <hello@acme.com>",
        "To: user@example.com",
        "Subject: Test",
        "List-Unsubscribe: <https://acme.com/u>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "hi",
        "",
      ]),
    );

    const pairs = buildHeaderPairs(parsed);
    const received = pairs.filter(([k]) => k.toLowerCase() === "received");
    expect(received).toHaveLength(2);
    expect(received.map(([, v]) => v)).toEqual(["from mx1.acme.com", "from mx2.acme.com"]);
    expect(pairs.some(([k]) => k.toLowerCase() === "list-unsubscribe")).toBe(true);
    expect(pairs.some(([k]) => k.toLowerCase() === "to")).toBe(true);
  });
});

describe("parseImapMessage — what the engine is handed", () => {
  it("passes both body parts, and repeated headers as an array", async () => {
    const source = raw([
      "Received: from mx1.acme.com",
      "Received: from mx2.acme.com",
      "From: Acme <hello@acme.com>",
      "Subject: Newsletter",
      'Content-Type: multipart/alternative; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "PLAIN text body line",
      "",
      "--b",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>HTML body paragraph</p>",
      "--b--",
      "",
    ]);
    await parseImapMessage({ uid: 1, source, size: source.length }, "imap-");

    const sent = handedOver();
    // Both parts go over: the engine picks the body and still reads footer
    // links off the html, which is why neither can be dropped here.
    expect(sent.text).toContain("PLAIN text body line");
    expect(sent.html).toContain("HTML body paragraph");
    expect(sent.headers["Received"]).toEqual(["from mx1.acme.com", "from mx2.acme.com"]);
    expect(sent.headers["From"]).toBe("Acme <hello@acme.com>");
  });

  it("omits a body part that isn't there rather than passing an empty one", async () => {
    const source = raw([
      "From: Acme <hello@acme.com>",
      "Subject: Promo",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Html only</p>",
      "",
    ]);
    await parseImapMessage({ uid: 2, source, size: source.length }, "imap-");

    // An empty string would read as "there is a text part" and change body
    // selection; absent is the honest signal.
    expect(handedOver().text).toBeUndefined();
    expect(handedOver().html).toContain("Html only");
  });

  it("stores the engine's verdict and the same pairs it was handed", async () => {
    const source = raw([
      "From: Acme <hello@acme.com>",
      "Subject: Newsletter",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "body",
      "",
    ]);
    const msg = await parseImapMessage({ uid: 4, source, size: source.length }, "imap-");

    expect(msg?.analysis).toBe(ANALYSIS);
    expect(msg?.id).toBe("imap-4");
    // raw_headers is serialized from the very pairs the engine saw.
    expect(JSON.parse(msg!.headersJson)).toContainEqual(["From", "Acme <hello@acme.com>"]);
  });

  it("marks the body truncated when the real size exceeds the fetched source", async () => {
    const source = raw([
      "From: Acme <hello@acme.com>",
      "Subject: Big",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "start of a very large message",
      "",
    ]);
    // RFC822.SIZE far exceeds what we fetched (source capped at 100KB in prod).
    const msg = await parseImapMessage(
      { uid: 3, source, size: source.length + 200_000 },
      "imap-",
    );
    expect(msg?.bodyTruncated).toBe(true);
  });

  it("leaves a body-less result untruncated", async () => {
    mockAnalyze.mockResolvedValue({ ...ANALYSIS, text: "" });
    const source = raw(["From: Acme <hello@acme.com>", "Subject: Empty", "", ""]);
    const msg = await parseImapMessage(
      { uid: 5, source, size: source.length + 200_000 },
      "imap-",
    );
    expect(msg?.bodyTruncated).toBeUndefined();
  });
});
