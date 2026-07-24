import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  isSenderContact,
  PERSONAL_DOMAINS,
  regionFromDomain,
} from "../src/index";

// These are part of the public API — consumers that supply the region hint
// (regionFromDomain), match findings against a company catalogue
// (isSenderContact), tell people's mail from companies' (PERSONAL_DOMAINS) or
// persist findings (ENGINE_VERSION) depend on these exports existing.
describe("public exports", () => {
  it("exposes regionFromDomain (ccTLD → region, uk→GB)", () => {
    expect(typeof regionFromDomain).toBe("function");
    expect(regionFromDomain("example.nl")).toBe("NL");
    expect(regionFromDomain("example.co.uk")).toBe("GB");
  });

  it("exposes isSenderContact", () => {
    expect(typeof isSenderContact).toBe("function");
  });

  it("exposes a non-empty PERSONAL_DOMAINS list", () => {
    expect(Array.isArray(PERSONAL_DOMAINS)).toBe(true);
    expect(PERSONAL_DOMAINS).toContain("gmail.com");
  });

  it("exposes a non-empty ENGINE_VERSION", () => {
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
  });
});
