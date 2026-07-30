import { describe, expect, it } from "vitest";
import { extractHeaderFacts } from "../src/extract/headers";

// One case per real provider shape, rebuilt with .example addresses. The header
// names, their order and the chain structure are what matter; the addresses are
// synthetic throughout.
//
// Vocabulary used below:
//   me@provider.example      the connected mailbox
//   shop@mydomain.example    a catch-all address the vendor was given
//   alias@relay.example      an alias-relay mask

const received = (headers: Record<string, string | string[]>) =>
  extractHeaderFacts(headers).receivedAddress;

describe("receivedAddress", () => {
  it("takes the earliest Delivered-To when a domain forwards into the mailbox", () => {
    // Gmail behind a forwarded custom domain: Gmail prepends its own entry, so
    // the address the vendor used sits at the bottom.
    expect(
      received({
        "delivered-to": ["me@provider.example", "shop@mydomain.example"],
        received: "from mx.forwarder.example by mx.provider.example for <shop@mydomain.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        to: "shop@mydomain.example",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("prefers X-Original-To when the provider resolved an alias to the mailbox", () => {
    // Proton with a custom domain: Delivered-To holds the resolved mailbox,
    // X-Original-To holds the address the sender actually used.
    expect(
      received({
        "x-original-to": "shop@mydomain.example",
        "delivered-to": "me@provider.example",
        received: "from mail.sender.example by mailin.provider.example for <shop@mydomain.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        to: "shop@mydomain.example",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("reads the lowest Received hop when both envelope headers name the mailbox", () => {
    // A third-party forwarder does not write an envelope header of its own, so
    // the provider's pair agree on the mailbox and only the trace holds the alias.
    expect(
      received({
        "x-original-to": "me@provider.example",
        "delivered-to": "me@provider.example",
        received: [
          "from mx.forwarder.example by mailin.provider.example for <me@provider.example>; Wed, 1 Jan 2025 00:00:01 +0000",
          "from mail.sender.example by mx.forwarder.example for <shop@mydomain.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        ],
        to: "shop@mydomain.example",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("uses the relay's own envelope header ahead of the rest of the chain", () => {
    // SimpleLogin, Proton Pass and addy.io state the alias outright. The chain
    // below it holds two further addresses that are also the reader's.
    expect(
      received({
        "x-simplelogin-envelope-to": "alias@relay.example",
        "x-original-to": "me@provider.example",
        "delivered-to": "me@provider.example",
        received: [
          "from mx.forwarder.example by mailin.provider.example for <me@provider.example>; Wed, 1 Jan 2025 00:00:01 +0000",
          "from mail.relay.example by mx.forwarder.example for <me@forward.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        ],
        to: "alias@relay.example",
      }),
    ).toBe("alias@relay.example");
  });

  it("takes the first address of the mail X-Forwarded-For chain", () => {
    // Cloudflare Email Routing writes original then final in one header.
    expect(
      received({
        "x-forwarded-for": "shop@mydomain.example me@provider.example",
        "x-forwarded-to": "me@provider.example",
        "x-original-to": "me@provider.example",
        "delivered-to": "me@provider.example",
        to: "shop@mydomain.example",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("reads X-Apparently-To when the provider writes no Delivered-To", () => {
    // Yahoo: no Delivered-To and no for clause anywhere.
    expect(
      received({
        "x-apparently-to": "me@provider.example; Wed, 1 Jan 2025 00:00:00 +0000",
        received: "from mail.sender.example by mta.provider.example; Wed, 1 Jan 2025 00:00:00 +0000",
        to: "me@provider.example",
      }),
    ).toBe("me@provider.example");
  });

  it("returns nothing when the provider records no delivery chain", () => {
    // Microsoft: no envelope header, and no for clause on any hop. To alone is
    // never enough, so these messages resolve to nothing by design.
    expect(
      received({
        received: [
          "from a.protection.outlook.example by b.prod.outlook.example; Wed, 1 Jan 2025 00:00:01 +0000",
          "from mail.sender.example by a.protection.outlook.example; Wed, 1 Jan 2025 00:00:00 +0000",
        ],
        to: "me@provider.example",
      }),
    ).toBeUndefined();
  });

  it("rejects a Delivered-To injected below the provider's own", () => {
    // Spam forges a lower Delivered-To. The sender's To does not back it, so
    // there is no result rather than a wrong one.
    expect(
      received({
        "delivered-to": ["me@provider.example", "junk@spammer.example"],
        to: "me@provider.example",
      }),
    ).toBeUndefined();
  });

  it("rejects a forged for clause that To does not back", () => {
    expect(
      received({
        "delivered-to": "me@provider.example",
        received: "from mail.sender.example by mx.provider.example for <victim@elsewhere.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        to: "me@provider.example",
      }),
    ).toBeUndefined();
  });

  it("returns nothing when the copy was blind carbon copied", () => {
    // Bcc leaves no recipient in the content headers, so nothing corroborates.
    expect(
      received({
        "delivered-to": "me@provider.example",
        to: "someone.else@other.example",
      }),
    ).toBeUndefined();
  });

  it("matches a plus tag against its base and keeps the tagged form", () => {
    expect(
      received({
        "delivered-to": "shop+news@mydomain.example",
        to: "shop@mydomain.example",
      }),
    ).toBe("shop+news@mydomain.example");
  });

  it("matches case-insensitively", () => {
    expect(
      received({
        "Delivered-To": "Shop@MyDomain.Example",
        To: "Alice <SHOP@mydomain.example>",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("finds the address among several To and Cc recipients", () => {
    expect(
      received({
        "delivered-to": "shop@mydomain.example",
        to: "first@other.example, second@other.example",
        cc: "shop@mydomain.example",
      }),
    ).toBe("shop@mydomain.example");
  });

  it("returns nothing when there are no headers to read", () => {
    expect(received({})).toBeUndefined();
  });

  // Known limitation: sender-side infrastructure can put an internal tracking
  // recipient in both the earliest Received hop and To. It is indistinguishable
  // from a real forwarding alias using these headers alone.
  it("resolves a sender-controlled tracking recipient", () => {
    expect(
      received({
        "delivered-to": "me@provider.example",
        received: [
          "from relay.sender-platform.example by mx.provider.example for <me@provider.example>; Wed, 1 Jan 2025 00:00:02 +0000",
          "from internal.sender-platform.example by relay.sender-platform.example for <jane.doe@example.com>; Wed, 1 Jan 2025 00:00:01 +0000",
          "from source.example by internal.sender-platform.example for <9zzzzzzzzzzzzzz@sender-platform.example>; Wed, 1 Jan 2025 00:00:00 +0000",
        ],
        to: "Jane Doe <9zzzzzzzzzzzzzz@sender-platform.example>",
      }),
    ).toBe("9zzzzzzzzzzzzzz@sender-platform.example");
  });

  // Known limitation, asserted so a change in behaviour is visible. A mailing
  // list expands to the reader, and the list address is both the earliest link
  // and the To, so it resolves. The reader removes it from the profile if they
  // do not want it. Measured at roughly one address per mailbox.
  it("resolves the list address for mailing-list expansion", () => {
    expect(
      received({
        "delivered-to": ["me@provider.example", "list@group.example"],
        to: "list@group.example",
      }),
    ).toBe("list@group.example");
  });
});
