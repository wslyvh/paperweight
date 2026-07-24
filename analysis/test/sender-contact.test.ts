import { describe, expect, it } from "vitest";
import { isSenderContact } from "../src/detect/sender-contact";
import type { Finding } from "../src/types";

function finding(type: Finding["type"], valueNormalized: string): Finding {
  return {
    type,
    valueRaw: valueNormalized,
    valueNormalized,
    start: 0,
    end: valueNormalized.length,
    confidence: "pattern",
    signals: [],
  };
}

describe("isSenderContact", () => {
  describe("phone", () => {
    it("matches a catalogue number written in international format", () => {
      expect(
        isSenderContact(finding("phone", "+31881234567"), {
          phones: ["+31 88 123 4567"],
        }),
      ).toBe(true);
    });

    it("matches a national-format catalogue number given the region", () => {
      expect(
        isSenderContact(finding("phone", "+31881234567"), { phones: ["088 123 4567"] }, "NL"),
      ).toBe(true);
    });

    it("does not match a different number", () => {
      expect(
        isSenderContact(finding("phone", "+31881234567"), {
          phones: ["+31 88 765 4321"],
        }),
      ).toBe(false);
    });

    it("does not match when the catalogue holds no phone", () => {
      expect(isSenderContact(finding("phone", "+31881234567"), {})).toBe(false);
    });

    it("ignores an unparseable catalogue value rather than matching loosely", () => {
      expect(
        isSenderContact(finding("phone", "+31881234567"), { phones: ["n/a"] }),
      ).toBe(false);
    });
  });

  describe("address", () => {
    // Normalization strips punctuation and case but does not fold letters, so a
    // transliterated spelling stays a different address. Accepted: the cost is a
    // company address shown once, not a user's value hidden.
    it("does not match a transliterated spelling", () => {
      expect(
        isSenderContact(finding("address", "beispielstrasse 12 10115 berlin"), {
          addresses: ["Beispielstraße 12, 10115 Berlin"],
        }),
      ).toBe(false);
    });

    it("matches an identical address written with different punctuation", () => {
      expect(
        isSenderContact(finding("address", "example street 12 1011 ab amsterdam"), {
          addresses: ["Example Street 12, 1011 AB Amsterdam"],
        }),
      ).toBe(true);
    });

    it("matches when the message prints only part of the catalogue address", () => {
      expect(
        isSenderContact(finding("address", "example street 12"), {
          addresses: ["Example Street 12, 1011 AB Amsterdam"],
        }),
      ).toBe(true);
    });

    it("matches when the message adds detail the catalogue omits", () => {
      expect(
        isSenderContact(finding("address", "floor 3 example street 12 1011 ab amsterdam"), {
          addresses: ["Example Street 12, 1011 AB Amsterdam"],
        }),
      ).toBe(true);
    });

    it("does not match on a shared token prefix", () => {
      expect(
        isSenderContact(finding("address", "po box 1000"), {
          addresses: ["PO Box 100, 1011 AB Amsterdam"],
        }),
      ).toBe(false);
    });

    it("does not match a different address", () => {
      expect(
        isSenderContact(finding("address", "other road 9 1011 ab amsterdam"), {
          addresses: ["Example Street 12, 1011 AB Amsterdam"],
        }),
      ).toBe(false);
    });
  });

  it("never matches a type the catalogue cannot speak to", () => {
    expect(
      isSenderContact(finding("email", "info@example.com"), {
        addresses: ["Example Street 12"],
        phones: ["+31881234567"],
      }),
    ).toBe(false);
  });
});
