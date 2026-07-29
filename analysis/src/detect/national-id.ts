// National ID detection driven by the data/national-ids.ts registry.
// Checksum AND (when required) a context keyword
// within ~40 chars; else no finding.
import { NATIONAL_IDS } from "../data/national-ids";
import type { Finding, Signal } from "../types";

export function detectNationalIds(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const spec of NATIONAL_IDS) {
    for (const m of text.matchAll(spec.pattern)) {
      if (!spec.validate(m[0])) continue;
      const signals: Signal[] = [{ id: "checksum." + spec.name }];
      if (spec.requiresContext) {
        const window = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
        const context = spec.requiresContext.exec(window);
        if (!context) continue;
        signals.push({ id: "context.keyword", detail: context[0].toLowerCase() });
      }
      findings.push({
        type: "national_id",
        valueRaw: m[0],
        valueNormalized: m[0].replace(/\s/g, ""),
        start: m.index,
        end: m.index + m[0].length,
        confidence: spec.confidence ?? "verified",
        country: spec.country,
        signals,
      });
    }
  }
  return findings;
}
