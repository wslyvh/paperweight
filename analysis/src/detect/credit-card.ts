// Credit card detection. Full numbers require ALL of:
// Luhn pass, IIN prefix match with scheme-valid length, and no tracking/order
// vocabulary directly before the number (tracking codes are the main FP).
// Masked forms ("**** 1234", "ending in 1234") are the common and valuable
// payment signal in order mail; they are contextual by nature.
import { CARD_SCHEMES } from "../data/card-schemes";
import type { Finding } from "../types";

const CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

// Which scheme/length pairs may stand on Luhn alone. Only the two combinations
// that dominate real card text: Amex at 15 (34/37) and the Visa/Mastercard
// ranges at 16. Everything else — notably the maestro range, which accepts
// 12-19 digits behind a 50/5[6-9]/6x prefix and so swallows any Luhn-passing
// reference number — has to be *written* like a card (grouped) or introduced as
// one. A 15-digit run starting 64/65/69 is a Discover/Maestro-range prefix at
// Amex's length: scheme and length disagree, so it is not a bare-card shape.
const BARE_CARD_SHAPES: Record<string, number[]> = {
  amex: [15],
  visa: [16],
  mastercard: [16],
};
const CARD_CONTEXT =
  /(?:card|kaart|karte|carte|visa|mastercard|maestro|credit|debit|betaal|payment|betaling|paiement|zahlung)[^]{0,30}$/i;

// "...number/code:" style labels that make a digit run a reference, not a card
const NEGATIVE_CONTEXT =
  /(?:track|trace|zending|bestelnummer|ordernummer|sendungs|suivi|commande|klantnummer|kundennummer|customer|invoice|factuur|referen|booking|boeking)[^]{0,30}$/i;

const MASKED_STARS = /(?:\*{2,4}[ -]?){1,3}(\d{4})(?!\d)/g;
const MASKED_PHRASE =
  /\b(?:ending (?:in|with)|eindigend op|eindigt op|endet auf|se terminant par)\s*:?\s*(\d{4})(?!\d)/gi;

export function detectCreditCards(text: string): Finding[] {
  const findings: Finding[] = [];

  for (const m of text.matchAll(CANDIDATE)) {
    const digits = normalizeCardNumber(m[0]);
    if (!isValidCardNumber(digits)) continue;
    const scheme = CARD_SCHEMES.find((s) => s.prefix.test(digits) && s.lengths.includes(digits.length));
    if (!scheme) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (NEGATIVE_CONTEXT.test(before)) continue;
    if (!(BARE_CARD_SHAPES[scheme.name] ?? []).includes(digits.length)) {
      const grouped = /[ -]/.test(m[0]);
      if (!grouped && !CARD_CONTEXT.test(before)) continue;
    }
    findings.push({
      type: "credit_card",
      valueRaw: m[0],
      valueNormalized: digits,
      start: m.index,
      end: m.index + m[0].length,
      confidence: "verified",
      signals: [{ id: "checksum.luhn" }, { id: "iin.match", detail: scheme.name }],
    });
  }

  for (const pattern of [MASKED_STARS, MASKED_PHRASE]) {
    for (const m of text.matchAll(pattern)) {
      findings.push({
        type: "credit_card",
        valueRaw: m[0],
        valueNormalized: "****" + m[1],
        start: m.index,
        end: m.index + m[0].length,
        confidence: "contextual",
        signals: [{ id: "context.masked-card" }],
      });
    }
  }
  return findings;
}

export function normalizeCardNumber(value: string): string {
  return value.replace(/[ -]/g, "");
}

export function isValidCardNumber(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (!CARD_SCHEMES.some((scheme) => (
    scheme.prefix.test(digits) && scheme.lengths.includes(digits.length)
  ))) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
