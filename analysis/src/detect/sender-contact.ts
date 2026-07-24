// The sending organization's own published contact details, supplied by a
// consumer that keeps a company catalogue. A match means the finding is the
// company's own boilerplate rather than anything about the reader — the same
// verdict detectPii already reaches for an email at the sender's own domain.
//
// This is a separate entry point rather than a detectPii option because a
// consumer generally learns which company a message belongs to after analysis,
// once the message is filed against a vendor.
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { Finding } from "../types";
import { normalizeAddress } from "./address";

export interface SenderContacts {
  phones?: string[];
  addresses?: string[];
}

// E.164, the same form detectPhones produces. Catalogue numbers are written in
// international format almost without exception, so the region hint only
// decides the rare national-format entry.
function toE164(value: string, region?: string): string | undefined {
  const parsed = parsePhoneNumberFromString(
    value,
    region && /^[A-Z]{2}$/.test(region) ? (region as CountryCode) : undefined,
  );
  return parsed?.isValid() ? parsed.number : undefined;
}

// Containment rather than equality, because the two sides are rarely written to
// the same extent: a catalogue holds the full postal line where a message may
// print only the street, or add a floor the catalogue omits. Comparing with
// surrounding spaces keeps it to whole tokens, so "po box 100" does not match
// "po box 1000".
function addressMatches(known: string, observed: string): boolean {
  if (!known || !observed) return false;
  return (
    ` ${known} `.includes(` ${observed} `) ||
    ` ${observed} `.includes(` ${known} `)
  );
}

export function isSenderContact(
  finding: Finding,
  contacts: SenderContacts,
  region?: string,
): boolean {
  if (finding.type === "phone") {
    return (contacts.phones ?? []).some(
      (phone) => toE164(phone, region) === finding.valueNormalized,
    );
  }
  if (finding.type === "address") {
    const observed = normalizeAddress(finding.valueNormalized);
    return (contacts.addresses ?? []).some((address) =>
      addressMatches(normalizeAddress(address), observed),
    );
  }
  return false;
}
