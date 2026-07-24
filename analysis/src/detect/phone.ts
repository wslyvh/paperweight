// Phone detection, only libphonenumber-js import.
// The library finds and validates numbers with offsets; our only additions
// are the region hint and the bare-digit-run guard: a national number
// written without any separators (0881234567) must have phone vocabulary
// nearby, else it is an invoice/customer number (the main FP — 16-digit
// reference numbers parse as valid German phones, for example).
import { findPhoneNumbersInText, type CountryCode } from "libphonenumber-js";
import type { Finding } from "../types";

const PHONE_VOCAB =
  /\b(?:tel|telefoon(?:nummer)?|phone|telephone|mobile|mobiel|mob|handy|kontakt|contact|call|bel|whatsapp)\b[^]{0,40}$/i;

export function detectPhones(text: string, region?: string): Finding[] {
  const defaultCountry =
    region && /^[A-Z]{2}$/.test(region) ? (region as CountryCode) : undefined;
  const findings: Finding[] = [];
  for (const m of findPhoneNumbersInText(text, defaultCountry)) {
    if (!m.number.isValid()) continue;
    const raw = text.slice(m.startsAt, m.endsAt);
    const international = raw.includes("+");
    // National-format numbers must look like one: trunk-prefix 0 (all our
    // wave-1 regions) or phone vocabulary nearby. Kills short service codes
    // (legacy service codes like "118 xxx" still validate) and digit runs in amounts/references.
    if (!international) {
      const vocab = PHONE_VOCAB.test(text.slice(Math.max(0, m.startsAt - 45), m.startsAt));
      if (!raw.replace(/\D/g, "").startsWith("0") && !vocab) continue;
      if (!/[\s\-().\/]/.test(raw) && !vocab) continue;
    }
    const finding: Finding = {
      type: "phone",
      valueRaw: raw,
      valueNormalized: m.number.number,
      start: m.startsAt,
      end: m.endsAt,
      confidence: international ? "verified" : "contextual",
      signals: [international ? { id: "phone.country-code" } : { id: "phone.national", detail: defaultCountry }],
    };
    if (m.number.country) finding.country = m.number.country;
    findings.push(finding);
  }
  return findings;
}

// ccTLD of the sender domain as a region hint (uk is the one ccTLD that
// differs from its ISO country code). Used by analyzeMessage when the caller
// passes no locale.
export function regionFromDomain(domain?: string): string | undefined {
  const tld = domain?.split(".").pop();
  if (!tld || tld.length !== 2) return undefined;
  const region = tld.toUpperCase();
  return region === "UK" ? "GB" : region;
}
