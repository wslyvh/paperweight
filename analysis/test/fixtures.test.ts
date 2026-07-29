import { describe, expect, it } from "vitest";
import { analyzeMessage, parseEml } from "../src/index";
import { analysisMismatches, loadFixtureCases } from "./harness";

const cases = loadFixtureCases();

describe.skipIf(cases.length === 0)("fixtures", () => {
  for (const fixture of cases) {
    it(fixture.name, async () => {
      const message =
        fixture.input.kind === "eml" ? await parseEml(fixture.input.raw) : fixture.input.message;
      const analysis = await analyzeMessage(message, fixture.options);
      expect(analysisMismatches(analysis, fixture.expected)).toEqual([]);
    });
  }
});
