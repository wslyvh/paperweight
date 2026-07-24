// Pragmatic RFC-ish email detection.
import type { Finding } from "../types";

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}\b/g;

export function detectEmails(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(EMAIL)) {
    findings.push({
      type: "email",
      valueRaw: m[0],
      valueNormalized: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
      confidence: "pattern",
      signals: [{ id: "pattern.email" }],
    });
  }
  return findings;
}

export function domainOf(address: string): string {
  return address.slice(address.indexOf("@") + 1).toLowerCase();
}

// Two domains belong to the same organization when they are equal or one is a
// subdomain of the other (mail.acme.com and acme.com). Used for the
// selfReference tag and, in the classifier, for DKIM and social-sender checks.
export function sameOrg(a: string, b: string): boolean {
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}
