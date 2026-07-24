import { describe, expect, it } from "vitest";
import { inSpan, markQuotedSegments } from "../src/detect/quotes";

describe("markQuotedSegments", () => {
  it("returns no spans for unquoted text", () => {
    expect(markQuotedSegments("Hallo,\n\nTot morgen!\nAlex")).toEqual([]);
  });

  it("marks a run of >-prefixed lines", () => {
    const text = "Prima!\n\n> Zullen we vrijdag afspreken?\n> Rond 10:00?\n\nGroet";
    const span = markQuotedSegments(text)[0]!;
    expect(text.slice(span.start, span.end)).toBe("> Zullen we vrijdag afspreken?\n> Rond 10:00?");
  });

  it("joins the attribution line directly above a > run", () => {
    const text = "Ok!\nOp 3 okt schreef Sam:\n> mijn rekening is NL91 ABNA 0417 1643 00";
    const span = markQuotedSegments(text)[0]!;
    expect(text.slice(span.start, span.end)).toContain("Op 3 okt schreef Sam:");
  });

  it("marks everything after a strict attribution line (bottom quote)", () => {
    const text = "Thanks!\n\nOn Mon, Oct 5, 2026 at 9:12 AM Alex <alex@x.example> wrote:\nHere is my IBAN\nNL91 ABNA 0417 1643 00";
    const span = markQuotedSegments(text)[0]!;
    expect(span.end).toBe(text.length);
    expect(inSpan(text.indexOf("NL91"), [span])).toBe(true);
    expect(inSpan(0, [span])).toBe(false);
  });

  it("does not treat arbitrary colon lines as attributions", () => {
    const text = "Agenda:\nPunt een\nPunt twee";
    expect(markQuotedSegments(text)).toEqual([]);
  });
});
