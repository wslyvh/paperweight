// Postcode detection driven by data/postal-codes.ts.
// Returns standalone-tier findings plus ALL candidates (both tiers) for the
// address-block detector to anchor on.
import { POSTAL_CODES } from "../data/postal-codes";
import type { Finding } from "../types";

const FLEXIBLE_SPACE_POSTAL_CODES = POSTAL_CODES.filter(
  (spec) => spec.optionalInternalSpace,
);

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
      const value = normalizePostalCode(m[0]);
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

function caseInsensitivePattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("i")
    ? pattern.flags
    : `${pattern.flags}i`;
  return new RegExp(pattern.source, flags);
}

function normalizedMatch(
  raw: string,
  validate?: (normalized: string) => boolean,
): string | undefined {
  const normalized = normalizePostalCode(raw.toUpperCase());
  return !validate || validate(normalized) ? normalized : undefined;
}

// A profile value is already asserted to be address data, so its own text may
// be inspected case-insensitively for matching anchors. This does not emit a
// postcode finding or infer anything that is absent from the supplied line.
export function findPostalCodesInAddress(raw: string): PostalCandidate[] {
  const candidates: PostalCandidate[] = [];
  for (const spec of POSTAL_CODES) {
    const pattern = caseInsensitivePattern(spec.pattern);
    for (const match of raw.matchAll(pattern)) {
      const value = normalizedMatch(match[0], spec.validate);
      if (!value) continue;
      candidates.push({
        country: spec.country,
        value,
        start: match.index,
        end: match.index + match[0].length,
        tier: spec.tier,
      });
    }
  }
  return candidates;
}

// Address input is already known to be an address, so supported postcode
// formats can be recognized case-insensitively here without weakening the
// standalone detector's uppercase precision rule. Only formats whose registry
// entry explicitly permits an omitted internal space participate.
export function canonicalizePostalCodesInAddress(raw: string): string {
  let canonical = raw;
  for (const spec of FLEXIBLE_SPACE_POSTAL_CODES) {
    const pattern = caseInsensitivePattern(spec.pattern);
    canonical = canonical.replace(pattern, (match) => (
      normalizedMatch(match, spec.validate) ?? match
    ));
  }
  return canonical;
}

// A canonical postcode has one internal separator. It may be omitted in raw
// text only when the compact form is itself accepted by the same supported
// postal registry (currently NL and GB). Numeric fragments and formats whose
// punctuation is meaningful remain strict.
export function canOmitPostalCodeSeparator(
  left: string,
  right: string,
): boolean {
  const compact = `${left}${right}`.toUpperCase();
  const canonical = `${left} ${right}`.toUpperCase();

  return FLEXIBLE_SPACE_POSTAL_CODES.some((spec) => {
    const match = caseInsensitivePattern(spec.pattern).exec(compact);
    if (
      !match
      || match.index !== 0
      || match[0].length !== compact.length
    ) {
      return false;
    }
    const normalized = normalizedMatch(match[0], spec.validate);
    return normalized === canonical;
  });
}

// canonical forms: NL "1234 AB", digit codes as-is (DE/FR/BE/PT/ZIP),
// US pair "NY 10001", GB "SW1A 1AA" (space before the 3-char inward code)
export function normalizePostalCode(code: string): string {
  const compact = code.replace(/\s/g, "");
  if (/^\d{4}[A-Z]{2}$/.test(compact)) return compact.slice(0, 4) + " " + compact.slice(4);
  if (/^[\d-]+$/.test(compact)) return compact;
  if (/^[A-Z]{2}\d{5}(?:-\d{4})?$/.test(compact)) return compact.slice(0, 2) + " " + compact.slice(2);
  return compact.slice(0, -3) + " " + compact.slice(-3);
}
