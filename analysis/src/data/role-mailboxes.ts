// Mailboxes and domains that are never a person's, let alone the reader's.
// Consumer: detectPii tags matching email findings selfReference, the same flag
// it uses for the sender's own domain — all of it means "real address, not the
// user's data".
//
// Role local parts hold regardless of domain: a parent company's support desk
// writes from a different domain than the brand that mails you, so matching on
// the sender's domain alone misses them.
const ROLE_LOCAL_PARTS = new Set([
  "info", "support", "service", "shop", "sales", "contact", "hello", "office",
  "admin", "billing", "help", "noreply", "no-reply", "newsletter", "press",
  "jobs", "privacy", "security",
]);

// Non-routable and internal-only TLDs (RFC 2606 / RFC 6761 plus the conventional
// corporate ones). Mail infrastructure leaks machine addresses at these —
// a UUID@something.intern is a server, not a person.
// Note: .example is deliberately NOT here. RFC 2606 reserves it for
// documentation, which is exactly what synthesized test data uses — listing it
// would flag every fixture address as organizational and hollow out the tests.
const NON_ROUTABLE_TLDS = new Set([
  "intern", "internal", "local", "lan", "test", "invalid", "localhost",
]);

// A plus-suffix never changes the role: "support+ticket123@" is still support.
export function isOrganizationalAddress(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at === -1) return false;
  const local = address.slice(0, at).toLowerCase();
  const domain = address.slice(at + 1).toLowerCase();
  const base = local.split("+")[0]!;
  if (ROLE_LOCAL_PARTS.has(base)) return true;
  const tld = domain.split(".").pop() ?? "";
  return NON_ROUTABLE_TLDS.has(tld);
}
