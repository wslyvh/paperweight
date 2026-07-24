// Postcode detection driven by data/postal-codes.ts.
// Returns standalone-tier findings plus ALL candidates (both tiers) for the
// address-block detector to anchor on.
import { POSTAL_CODES } from "../data/postal-codes";
import type { Finding } from "../types";

export interface PostalCandidate {
  country: string;
  value: string; // normalized
  start: number;
  end: number;
  tier: "standalone" | "anchor-only";
}

export function detectPostalCodes(text: string): { findings: Finding[]; candidates: PostalCandidate[] } {
  const findings: Finding[] = [];
  const candidates: PostalCandidate[] = [];
  for (const spec of POSTAL_CODES) {
    for (const m of text.matchAll(spec.pattern)) {
      const value = normalize(m[0]);
      if (spec.validate && !spec.validate(value)) continue;
      candidates.push({ country: spec.country, value, start: m.index, end: m.index + m[0].length, tier: spec.tier });
      if (spec.tier !== "standalone") continue;
      findings.push({
        type: "postal_code",
        valueRaw: m[0],
        valueNormalized: value,
        start: m.index,
        end: m.index + m[0].length,
        confidence: "pattern",
        country: spec.country,
        signals: [{ id: "pattern.postal-code", detail: spec.country }],
      });
    }
  }
  return { findings, candidates };
}

// canonical forms: NL "1234 AB", digit codes as-is (DE/FR/BE/PT/ZIP),
// US pair "NY 10001", GB "SW1A 1AA" (space before the 3-char inward code)
function normalize(code: string): string {
  const compact = code.replace(/\s/g, "");
  if (/^\d{4}[A-Z]{2}$/.test(compact)) return compact.slice(0, 4) + " " + compact.slice(4);
  if (/^[\d-]+$/.test(compact)) return compact;
  if (/^[A-Z]{2}\d{5}(?:-\d{4})?$/.test(compact)) return compact.slice(0, 2) + " " + compact.slice(2);
  return compact.slice(0, -3) + " " + compact.slice(-3);
}
