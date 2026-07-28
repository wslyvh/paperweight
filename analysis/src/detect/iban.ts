// IBAN detection: candidates validated against the
// country length table and ISO 7064 mod-97; emit only on pass.
import { IBAN_LENGTHS } from "../data/iban-lengths";
import type { Finding } from "../types";

const CANDIDATE = /\b[A-Z]{2}\d{2}(?:[ .]?[A-Z0-9]){11,30}\b/g;

export function detectIbans(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const normalized = normalizeIban(m[0]);
    const country = normalized.slice(0, 2);
    if (!isValidIban(normalized)) continue;
    findings.push({
      type: "iban",
      valueRaw: m[0],
      valueNormalized: normalized,
      start: m.index,
      end: m.index + m[0].length,
      confidence: "verified",
      country,
      signals: [{ id: "checksum.mod97" }],
    });
  }
  return findings;
}

export function normalizeIban(value: string): string {
  return value.toUpperCase().replace(/[ .]/g, "");
}

export function isValidIban(iban: string): boolean {
  const country = iban.slice(0, 2);
  if (IBAN_LENGTHS[country] !== iban.length) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}
