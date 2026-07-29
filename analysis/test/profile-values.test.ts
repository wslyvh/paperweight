import { describe, expect, it } from "vitest";
import { normalizeValue, validateValue } from "../src/index";

describe("profile values", () => {
  it("normalizes and validates complete email addresses", () => {
    expect(normalizeValue("email", " Person+Shop@Example.COM ")).toBe(
      "person+shop@example.com",
    );
    expect(validateValue("email", "person+shop@example.com")).toBe(true);
    expect(validateValue("email", "person@example")).toBe(false);
  });

  it("normalizes explicit international phones without inferring local ones", () => {
    expect(normalizeValue("phone", "+31 6 1234 5678")).toBe("+31612345678");
    expect(normalizeValue("phone", "06 1234 5678")).toBe("0612345678");
    expect(validateValue("phone", "+31 6 1234 5678")).toBe(true);
    expect(validateValue("phone", "06 1234 5678")).toBe(true);
  });

  it("validates IBANs with the detector checksum and length rules", () => {
    expect(normalizeValue("iban", "nl91 abna 0417 1643 00")).toBe(
      "NL91ABNA0417164300",
    );
    expect(validateValue("iban", "NL91 ABNA 0417 1643 00")).toBe(true);
    expect(validateValue("iban", "NL91 ABNA 0417 1643 01")).toBe(false);
  });

  it("validates cards with known schemes and Luhn", () => {
    expect(normalizeValue("credit_card", "4111 1111 1111 1111")).toBe(
      "4111111111111111",
    );
    expect(validateValue("credit_card", "4111 1111 1111 1111")).toBe(true);
    expect(validateValue("credit_card", "4111 1111 1111 1112")).toBe(false);
  });

  it("accepts the detector's existing masked-card match form", () => {
    expect(normalizeValue("credit_card", "**** **** **** 1234")).toBe(
      "****1234",
    );
    expect(validateValue("credit_card", "****1234")).toBe(true);
  });

  it("keeps national ID validation country-neutral", () => {
    expect(normalizeValue("national_id", "ab 12 34")).toBe("AB1234");
    expect(validateValue("national_id", "ab 12 34")).toBe(true);
    expect(validateValue("national_id", "AB-12-34")).toBe(false);
  });

  it("normalizes raw addresses without adding country data", () => {
    expect(normalizeValue("address", "California Road, CA, US")).toBe(
      "california road ca us",
    );
  });

  it("canonicalizes supported postcode formatting inside addresses", () => {
    expect(
      normalizeValue("address", "Voorbeeldsingel 7 1234AB Teststad"),
    ).toBe("voorbeeldsingel 7 1234 ab teststad");
    expect(
      normalizeValue("address", "Voorbeeldsingel 7 1234 AB Teststad"),
    ).toBe("voorbeeldsingel 7 1234 ab teststad");
    expect(
      normalizeValue("address", "10 Downing Street SW1A2AA London"),
    ).toBe("10 downing street sw1a 2aa london");
  });

  it("does not collapse arbitrary numeric word boundaries in addresses", () => {
    expect(normalizeValue("address", "Example 12 345 Town")).toBe(
      "example 12 345 town",
    );
  });

  it("normalizes and validates supported postal formats without a country hint", () => {
    expect(normalizeValue("postal_code", "1234ab")).toBe("1234 AB");
    expect(validateValue("postal_code", "1234ab")).toBe(true);
    expect(validateValue("postal_code", "not a postcode")).toBe(false);
  });
});
