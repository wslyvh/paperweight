import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/index";
import type { RawMessage } from "../src/types";

// analyzeMessage's two consumer-facing guarantees:
//   1. `text` is the body that was analyzed, so a consumer storing it keeps
//      finding offsets valid.
//   2. the subject informs the message TYPE only — it is never analyzed for
//      findings, so it can never shift an offset.
// All content here is synthetic.

const FROM = "Shop <orders@shop.example>";

const BODY = [
  "Hello,",
  "",
  "Your parcel is on its way.",
  "Questions? Write to help@shop.example or billing@shop.example.",
  "",
].join("\n");

const message = (over: Partial<RawMessage> = {}): RawMessage => ({
  headers: { From: FROM },
  ...over,
});

describe("analyzeMessage — the analyzed text", () => {
  it("returns the text part when there is one", async () => {
    const analysis = await analyzeMessage(
      message({ text: "A plain part", html: "<p>An html part</p>" }),
    );
    expect(analysis.text).toBe("A plain part");
  });

  it("returns the html conversion when there is no text part", async () => {
    const analysis = await analyzeMessage(message({ html: "<p>First line</p><p>Second line</p>" }));
    expect(analysis.text).toBe("First line\nSecond line");
  });

  it("is empty when the message has no body at all", async () => {
    expect((await analyzeMessage(message())).text).toBe("");
  });

  it("returns findings whose offsets index into that text", async () => {
    const analysis = await analyzeMessage(message({ text: BODY }));

    expect(analysis.text).toBe(BODY);
    expect(analysis.findings.length).toBeGreaterThanOrEqual(2);
    for (const finding of analysis.findings) {
      expect(analysis.text.slice(finding.start, finding.end)).toBe(finding.valueRaw);
    }
  });

  it("caps the text before detection and reports the truncation", async () => {
    const prefix = "Delivery update.\n";
    const analysis = await analyzeMessage(
      message({ text: `${prefix}${"x".repeat(80)}\nhelp@shop.example` }),
      { maxTextLength: prefix.length + 20 },
    );

    expect(analysis.text).toHaveLength(prefix.length + 20);
    expect(analysis.textTruncated).toBe(true);
    expect(
      analysis.findings.some((finding) => finding.valueNormalized === "help@shop.example"),
    ).toBe(false);
  });
});

describe("analyzeMessage — the subject types the message, never the findings", () => {
  it("classifies a body-less message from its subject", async () => {
    const analysis = await analyzeMessage(
      message({ headers: { From: FROM, Subject: "Your order has shipped" } }),
    );
    expect(analysis.type).toBe("purchase");
  });

  it("does not reach that verdict without the subject", async () => {
    // Pins the subject's contribution: the same message, minus the one line
    // that carried the purchase vocabulary.
    expect((await analyzeMessage(message())).type).not.toBe("purchase");
  });

  it("never turns a subject value into a finding, and never shifts offsets", async () => {
    const withSubject = await analyzeMessage(
      message({
        headers: { From: FROM, Subject: "Your order has shipped — reply to noreply@shop.example" },
        text: BODY,
      }),
    );
    const withoutSubject = await analyzeMessage(message({ text: BODY }));

    expect(withSubject.findings.some((f) => f.valueNormalized === "noreply@shop.example")).toBe(
      false,
    );
    expect(withSubject.findings.map((f) => [f.valueRaw, f.start, f.end])).toEqual(
      withoutSubject.findings.map((f) => [f.valueRaw, f.start, f.end]),
    );
  });
});

describe("analyzeMessage — structural footer anchor", () => {
  it("requires a resolved unsubscribe action for the promotion type", async () => {
    const listLike = await analyzeMessage(
      message({
        headers: {
          From: FROM,
          "List-ID": "<news.shop.example>",
          Precedence: "bulk",
        },
        html: "<p>Weekly news</p>",
      }),
    );

    expect(listLike.unsubscribe).toBeUndefined();
    expect(listLike.type).not.toBe("promotion");
  });

  it("uses the resolved unsubscribe link even when it sits before the text window", async () => {
    const analysis = await analyzeMessage(
      message({
        html: [
          "<p>Your delivery contact is +31 6 12345678.</p>",
          '<p><a href="https://shop.example/unsubscribe">Unsubscribe</a></p>',
          "<p>Company switchboard: +1 202 555 0125.</p>",
          `<p>${"Additional legal information. ".repeat(20)}</p>`,
        ].join(""),
      }),
    );

    expect(analysis.unsubscribe).toEqual({
      method: "footer",
      target: "https://shop.example/unsubscribe",
    });
    expect(
      analysis.findings.find((finding) => finding.valueNormalized === "+31612345678")
        ?.inFooter,
    ).toBeUndefined();
    expect(
      analysis.findings.find((finding) => finding.valueNormalized === "+12025550125")
        ?.inFooter,
    ).toBe(true);
  });

  it("uses the body footer anchor even when a header unsubscribe action wins", async () => {
    const analysis = await analyzeMessage(
      message({
        headers: {
          From: FROM,
          "List-Unsubscribe": "<https://shop.example/header-unsubscribe>",
        },
        html: [
          "<p>Your delivery contact is +31 6 12345678.</p>",
          '<p><a href="https://shop.example/body-unsubscribe">Unsubscribe</a></p>',
          "<p>Company switchboard: +1 202 555 0125.</p>",
          `<p>${"Additional legal information. ".repeat(20)}</p>`,
        ].join(""),
      }),
    );

    expect(analysis.unsubscribe).toEqual({
      method: "list-unsubscribe",
      target: "https://shop.example/header-unsubscribe",
    });
    expect(
      analysis.findings.find(
        (finding) => finding.valueNormalized === "+12025550125",
      )?.inFooter,
    ).toBe(true);
  });

  it("recovers the link line when offline re-analysis retains only the link fact", async () => {
    const text = [
      "Short update.",
      "Unsubscribe",
      "Company switchboard: +1 202 555 0125.",
      "Additional legal information. ".repeat(20),
    ].join("\n");
    const withoutFact = await analyzeMessage(message({ text }));
    const withFact = await analyzeMessage(message({ text }), {
      knownUnsubscribe: {
        method: "footer",
        target: "https://shop.example/unsubscribe",
      },
    });

    expect(
      withoutFact.findings.find((finding) => finding.valueNormalized === "+12025550125")
        ?.inFooter,
    ).toBeUndefined();
    expect(
      withFact.findings.find((finding) => finding.valueNormalized === "+12025550125")
        ?.inFooter,
    ).toBe(true);
    expect(withFact.type).toBe("promotion");
  });
});
