import { describe, expect, it } from "vitest";
import type { Analysis } from "../src/types";
import { analysisMismatches, subsetMismatches } from "./harness";

function baseAnalysis(partial: Partial<Analysis>): Analysis {
  return {
    lang: "und",
    findings: [],
    text: "",
    type: "unknown",
    typeConfidence: 0,
    typeSignals: [],
    version: "0.0.0-test",
    ...partial,
  };
}

describe("subsetMismatches", () => {
  it("passes when expected keys match and actual has extras", () => {
    expect(subsetMismatches({ a: 1, b: "x" }, { a: 1 })).toEqual([]);
  });

  it("reports scalar mismatches with their path", () => {
    const errors = subsetMismatches({ a: { b: 2 } }, { a: { b: 3 } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("$.a.b");
  });

  it("reports missing keys", () => {
    const errors = subsetMismatches({}, { lang: "nl" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("$.lang");
  });

  it("matches array elements by containment, order-insensitive", () => {
    const actual = [
      { type: "email", valueNormalized: "a@b.nl" },
      { type: "iban", valueNormalized: "NL02ABNA0123456789" },
    ];
    expect(subsetMismatches(actual, [{ type: "iban" }])).toEqual([]);
    expect(subsetMismatches(actual, [{ type: "iban" }, { type: "email" }])).toEqual([]);
  });

  it("reports array elements that match nothing", () => {
    const errors = subsetMismatches([{ type: "email" }], [{ type: "phone" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("[0]");
  });

  it("rejects type mismatches between expected and actual", () => {
    expect(subsetMismatches("text", { a: 1 })).toHaveLength(1);
    expect(subsetMismatches({ a: 1 }, [1])).toHaveLength(1);
    expect(subsetMismatches(null, { a: 1 })).toHaveLength(1);
  });
});

describe("analysisMismatches", () => {
  it("checks the expected object as a subset of the analysis", () => {
    const analysis = baseAnalysis({ lang: "nl" });
    expect(analysisMismatches(analysis, { lang: "nl" })).toEqual([]);
    expect(analysisMismatches(analysis, { lang: "en" })).toHaveLength(1);
  });

  it("never asserts version", () => {
    expect(analysisMismatches(baseAnalysis({}), {})).toEqual([]);
  });

  it("enforces findingCount exactly", () => {
    const analysis = baseAnalysis({
      findings: [
        {
          type: "email",
          valueRaw: "a@b.nl",
          valueNormalized: "a@b.nl",
          start: 0,
          end: 6,
          confidence: "pattern",
          signals: [],
        },
      ],
    });
    expect(analysisMismatches(analysis, { findingCount: 1 })).toEqual([]);
    expect(analysisMismatches(analysis, { findingCount: 0 })).toHaveLength(1);
  });

  it("fails when an absent shape matches a finding", () => {
    const analysis = baseAnalysis({
      findings: [
        {
          type: "credit_card",
          valueRaw: "4111 1111 1111 1111",
          valueNormalized: "4111111111111111",
          start: 0,
          end: 19,
          confidence: "verified",
          signals: [],
        },
      ],
    });
    expect(analysisMismatches(analysis, { absent: [{ type: "credit_card" }] })).toHaveLength(1);
    expect(analysisMismatches(analysis, { absent: [{ type: "iban" }] })).toEqual([]);
  });
});
