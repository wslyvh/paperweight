// detectPii orchestration: fixed detector sequence,
// then dedupe by (type, valueNormalized), then overlap resolution (longer
// span wins, then higher confidence, then detector order), then the
// inQuotedText / inFooter / isOwnIdentifier / selfReference tags.
import type { Finding, KnownPiiValue } from "../types";
import { detectAddressBlocks } from "./address";
import { detectCreditCards } from "./credit-card";
import { isOrganizationalAddress } from "../data/role-mailboxes";
import { detectEmails, domainOf, sameOrg } from "./email";
import { detectIbans } from "./iban";
import { detectNationalIds } from "./national-id";
import { detectPhones } from "./phone";
import { detectPostalCodes } from "./postal-code";
import {
  detectKnownValues,
  reconcileKnownAddressFindings,
} from "./known-values";
import { inSpan, type Span } from "./quotes";

export interface DetectContext {
  quoted: Span[];
  footer: Span[];
  region?: string; // ISO 3166-1 alpha-2 phone region hint
  ownEmails?: string[];
  knownValues?: readonly KnownPiiValue[];
  senderDomain?: string;
}

const CONFIDENCE_RANK = { verified: 0, pattern: 1, contextual: 2 };

export function detectPii(text: string, ctx: DetectContext): Finding[] {
  if (!text) return [];

  const postal = detectPostalCodes(text);
  const raw = reconcileKnownAddressFindings([
    ...detectEmails(text),
    ...detectIbans(text),
    ...detectCreditCards(text),
    ...detectNationalIds(text),
    ...detectPhones(text, ctx.region),
    ...corroboratedPostalCodes(postal.findings, ctx.region),
    ...detectAddressBlocks(text, postal.candidates),
    ...detectKnownValues(text, ctx.knownValues ?? []),
  ], ctx.knownValues ?? []);

  const findings = resolveOverlaps(dedupe(raw)).sort((a, b) => a.start - b.start);

  const own = new Set((ctx.ownEmails ?? []).map((e) => e.toLowerCase()));
  const sender = ctx.senderDomain?.toLowerCase();
  for (const f of findings) {
    if (inSpan(f.start, ctx.quoted)) f.inQuotedText = true;
    if (inSpan(f.start, ctx.footer)) f.inFooter = true;
    if (f.type === "email") {
      if (own.has(f.valueNormalized)) f.isOwnIdentifier = true;
      // Organizational either way: the sender's own domain, a role mailbox at
      // any domain, or an address on a non-routable internal TLD.
      if (
        (sender && sameOrg(domainOf(f.valueNormalized), sender)) ||
        isOrganizationalAddress(f.valueNormalized)
      ) {
        f.selfReference = true;
      }
    }
  }
  return findings;
}

// A postcode on its own says almost nothing, and its shape is shared with
// coupon codes and order references. It stands as a finding only when the
// country it belongs to is the country the message came from.
//
// The other corroboration — a street beside it — needs no clause here: a
// postcode that anchors an address block is inside that block's span, and
// overlap resolution keeps the longer, more specific address finding instead.
function corroboratedPostalCodes(findings: Finding[], region?: string): Finding[] {
  const country = region?.toUpperCase();
  return country ? findings.filter((f) => f.country === country) : [];
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = f.type + ":" + f.valueNormalized;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Overlapping spans of different types (postal code inside an address block,
// digit run readable as both card and phone): the longer span is the more
// specific interpretation; ties go to confidence, then to detector order.
function resolveOverlaps(findings: Finding[]): Finding[] {
  let kept: Finding[] = [];
  for (const f of findings) {
    const rivals = kept.filter((k) => f.start < k.end && k.start < f.end);
    if (rivals.every((k) => beats(f, k))) {
      kept = kept.filter((k) => !rivals.includes(k));
      kept.push(f);
    }
  }
  return kept;
}

function beats(a: Finding, b: Finding): boolean {
  if (a.type === "address" && b.type === "address") {
    const componentA = a.signals.some(
      (signal) => signal.id === "known-value.address-components",
    );
    const componentB = b.signals.some(
      (signal) => signal.id === "known-value.address-components",
    );
    if (componentA !== componentB) return componentA;
  }

  const lengthA = a.end - a.start;
  const lengthB = b.end - b.start;
  if (lengthA !== lengthB) return lengthA > lengthB;
  return CONFIDENCE_RANK[a.confidence] < CONFIDENCE_RANK[b.confidence];
}
