// Header facts from a RawMessage. Extractors return structured facts; Signal
// objects are minted by the deciders that cite them.
import type { RawMessage } from "../types";

export interface HeaderFacts {
  from?: Mailbox;
  replyTo?: Mailbox;
  subject?: string;
  listUnsubscribe?: { urls: string[]; mailtos: string[] };
  listUnsubscribePost: boolean;
  listId?: string;
  precedence?: string;
  autoSubmitted?: string;
  isNoreplyFrom: boolean;
  isReply: boolean;
  dkimDomains: string[];
}

interface Mailbox {
  address: string;
  domain: string;
  displayName?: string;
}

export function extractHeaderFacts(headers: RawMessage["headers"]): HeaderFacts {
  const lookup = new Map<string, string[]>();
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    const values = Array.isArray(value) ? value : [value];
    lookup.set(name, [...(lookup.get(name) ?? []), ...values]);
  }
  const first = (name: string): string | undefined => lookup.get(name)?.[0];
  const all = (name: string): string[] => lookup.get(name) ?? [];

  const facts: HeaderFacts = {
    listUnsubscribePost:
      /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i.test(
        first("list-unsubscribe-post") ?? "",
      ),
    isNoreplyFrom: false,
    isReply: Boolean(first("in-reply-to") || first("references")),
    dkimDomains: [],
  };

  const from = first("from");
  if (from !== undefined) {
    const mailbox = parseMailbox(from);
    if (mailbox) {
      facts.from = mailbox;
      facts.isNoreplyFrom = /^(?:no[-._]?reply|do[-._]?not[-._]?reply)/i.test(mailbox.address);
    }
  }
  const replyTo = first("reply-to");
  if (replyTo !== undefined) {
    const mailbox = parseMailbox(replyTo);
    if (mailbox) facts.replyTo = mailbox;
  }

  const subject = first("subject");
  if (subject !== undefined) facts.subject = subject;
  const listId = first("list-id");
  if (listId !== undefined) facts.listId = listId;
  const precedence = first("precedence");
  if (precedence !== undefined) facts.precedence = precedence;
  const autoSubmitted = first("auto-submitted");
  if (autoSubmitted !== undefined) facts.autoSubmitted = autoSubmitted;

  const urls: string[] = [];
  const mailtos: string[] = [];
  for (const value of all("list-unsubscribe")) {
    let foundBracketedTarget = false;
    for (const entry of value.matchAll(/<([^>]+)>/g)) {
      foundBracketedTarget = true;
      const target = entry[1]!.trim();
      if (/^mailto:/i.test(target)) mailtos.push(target);
      else if (/^https?:/i.test(target)) urls.push(target);
    }
    // RFC 2369 recommends angle brackets, but a meaningful share of real mail
    // sends one bare URI. Preserve that safe legacy fallback.
    if (!foundBracketedTarget) {
      const target = value.trim();
      if (/^mailto:[^\s,]+$/i.test(target)) mailtos.push(target);
      else if (/^https?:\/\/[^\s,]+$/i.test(target)) urls.push(target);
    }
  }
  if (urls.length > 0 || mailtos.length > 0) facts.listUnsubscribe = { urls, mailtos };

  for (const signature of all("dkim-signature")) {
    const domain = /(?:^|;)\s*d\s*=\s*([^;\s]+)/.exec(signature)?.[1]?.toLowerCase();
    if (domain && !facts.dkimDomains.includes(domain)) facts.dkimDomains.push(domain);
  }

  return facts;
}

// Pragmatic RFC 5322-lite: "Display Name <addr>" or a bare address. Real
// header decoding (RFC 2047) already happened in the eml adapter.
function parseMailbox(value: string): Mailbox | undefined {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  let address: string;
  let displayName: string | undefined;
  if (angle) {
    address = angle[1]!;
    const name = value.slice(0, angle.index).trim().replace(/^"(.*)"$/s, "$1").trim();
    if (name) displayName = name;
  } else {
    const bare = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bare)) return undefined;
    address = bare;
  }
  address = address.toLowerCase();
  const domain = address.slice(address.indexOf("@") + 1);
  return displayName !== undefined ? { address, domain, displayName } : { address, domain };
}
