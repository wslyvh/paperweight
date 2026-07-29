// Which of the reader's own addresses a message was delivered to.
//
// Every recipient gets their own copy with their own envelope, so the receiving
// side can record which address this copy was for. That is the address a vendor
// actually holds, which is often not the connected mailbox: aliases, relay masks
// and catch-all domains all resolve to one mailbox in the end.
//
// Two things have to line up before we believe it. The delivery chain has to
// name an address, and the sender's own To/Cc has to name the same one. A trace
// header alone is forgeable — spam injects a Delivered-To below the real one —
// and a To/Cc alone says nothing about where the message was delivered. Requiring
// both means two parties with no shared interest agree. When they do not there is
// no answer, and that is a normal outcome rather than a failure.
//
// Dependency-free on purpose, like ./contracts: a consumer that only wants this
// answer can import it without pulling in the rest of the engine.

type Headers = Record<string, string | string[]>;

const ADDRESS = /[^\s<>,;"()]+@[^\s<>,;"()]+/g;

function normalizeAddress(raw: string): string {
  return raw.toLowerCase().replace(/[.,;>]+$/, "");
}

function addressesIn(value: string): string[] {
  return (value.match(ADDRESS) ?? []).map(normalizeAddress);
}

/** a+tag@d and a@d are one mailbox. Used to compare only; the returned value
 *  stays as the headers wrote it, tag included. */
function plusBase(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return address;
  const local = address.slice(0, at);
  const plus = local.indexOf("+");
  return `${plus < 0 ? local : local.slice(0, plus)}${address.slice(at)}`;
}

/** The envelope recipient an MTA optionally records on its Received line. RFC
 *  5321 lets it omit the clause, and multi-recipient envelopes normally do, so
 *  its presence is itself evidence that this copy went to one address. */
function forClause(received: string): string | undefined {
  const match = /\bfor\s+<?([^\s<>;,]+@[^\s<>;,]+?)>?\s*(?:;|$)/i.exec(received);
  return match ? normalizeAddress(match[1]!) : undefined;
}

/** Earliest address in the delivery chain: what the sender used, rather than the
 *  mailbox it ended up in. Ordered by how close each header sits to the sender,
 *  not by how much the name is trusted. */
function chainAddress(all: (name: string) => string[]): string | undefined {
  // Alias relays state the alias outright, before any forwarding happened.
  const relay = all("x-simplelogin-envelope-to")[0];
  if (relay) {
    const address = addressesIn(relay)[0];
    if (address) return address;
  }

  // Cloudflare Email Routing writes the whole chain here, original address
  // first. This is the mail header of that name: it holds addresses, not IPs.
  const forwarded = all("x-forwarded-for")[0];
  if (forwarded) {
    const address = addressesIn(forwarded)[0];
    if (address) return address;
  }

  // Received is prepended per hop, so the last entry is the earliest hop.
  const hops = all("received")
    .map(forClause)
    .filter((address): address is string => address !== undefined);
  if (hops.length > 0) return hops[hops.length - 1];

  const delivered = all("delivered-to")
    .map((value) => addressesIn(value)[0])
    .filter((address): address is string => address !== undefined);

  // Postfix, Exim, Fastmail and Yahoo record the pre-resolution recipient in one
  // of these. Proton writes X-Original-To alongside Delivered-To with the same
  // value, so it only says something new when the two differ.
  const pre = addressesIn(
    all("x-original-to")[0] ??
      all("envelope-to")[0] ??
      all("x-delivered-to")[0] ??
      all("x-apparently-to")[0] ??
      "",
  )[0];
  if (pre && (delivered.length === 0 || plusBase(pre) !== plusBase(delivered[0]!))) {
    return pre;
  }

  return delivered[delivered.length - 1];
}

export function resolveReceivedAddress(headers: Headers): string | undefined {
  const lookup = new Map<string, string[]>();
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    const values = Array.isArray(value) ? value : [value];
    lookup.set(name, [...(lookup.get(name) ?? []), ...values]);
  }
  const all = (name: string): string[] => lookup.get(name) ?? [];

  const candidate = chainAddress(all);
  if (candidate === undefined) return undefined;
  const addressed = [...all("to"), ...all("cc")].flatMap(addressesIn);
  const base = plusBase(candidate);
  return addressed.some((address) => plusBase(address) === base)
    ? candidate
    : undefined;
}
