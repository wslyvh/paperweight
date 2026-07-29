import { describe, expect, it } from "vitest";
import {
  isSupportedCountryCode,
  normalizeCountryCode,
} from "../src/country";

describe("country codes", () => {
  it("normalizes supported two-letter country codes", () => {
    expect(normalizeCountryCode(" nl ")).toBe("NL");
    expect(isSupportedCountryCode(" nl ")).toBe(true);
    expect(isSupportedCountryCode("US")).toBe(true);
  });

  it("rejects unknown and non-two-letter region values", () => {
    expect(isSupportedCountryCode("XX")).toBe(false);
    expect(isSupportedCountryCode("ZZ")).toBe(false);
    expect(isSupportedCountryCode("NLD")).toBe(false);
  });
});
