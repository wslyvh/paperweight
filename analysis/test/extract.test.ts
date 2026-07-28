import { describe, expect, it } from "vitest";
import { selectBody } from "../src/extract/body";
import { extractHeaderFacts } from "../src/extract/headers";

describe("extractHeaderFacts", () => {
  it("parses from with display name, address, and domain", () => {
    const facts = extractHeaderFacts({ from: "Alice Example <alice@Shop.example>" });
    expect(facts.from).toEqual({
      address: "alice@shop.example",
      domain: "shop.example",
      displayName: "Alice Example",
    });
  });

  it("parses a bare from address", () => {
    const facts = extractHeaderFacts({ from: "alice@shop.example" });
    expect(facts.from).toEqual({ address: "alice@shop.example", domain: "shop.example" });
  });

  it("strips quotes around display names", () => {
    const facts = extractHeaderFacts({ from: '"Shop, The" <info@shop.example>' });
    expect(facts.from?.displayName).toBe("Shop, The");
  });

  it("reads headers case-insensitively", () => {
    const facts = extractHeaderFacts({
      From: "a@b.example",
      "List-ID": "<news.shop.example>",
    });
    expect(facts.from?.address).toBe("a@b.example");
    expect(facts.listId).toBe("<news.shop.example>");
  });

  it("parses list-unsubscribe urls and mailtos", () => {
    const facts = extractHeaderFacts({
      "list-unsubscribe": "<mailto:unsub@shop.example>, <https://shop.example/u?id=1>",
    });
    expect(facts.listUnsubscribe).toEqual({
      urls: ["https://shop.example/u?id=1"],
      mailtos: ["mailto:unsub@shop.example"],
    });
  });

  it("accepts a single unbracketed list-unsubscribe target", () => {
    expect(
      extractHeaderFacts({
        "list-unsubscribe": "https://shop.example/u?id=1",
      }).listUnsubscribe,
    ).toEqual({
      urls: ["https://shop.example/u?id=1"],
      mailtos: [],
    });
  });

  it("detects RFC 8058 one-click", () => {
    const facts = extractHeaderFacts({
      "list-unsubscribe": "<https://shop.example/u>",
      "list-unsubscribe-post": "List-Unsubscribe=One-Click",
    });
    expect(facts.listUnsubscribePost).toBe(true);
  });

  it("does not treat an incidental one-click phrase as RFC 8058", () => {
    const facts = extractHeaderFacts({
      "list-unsubscribe-post": "Visit one-click preferences",
    });
    expect(facts.listUnsubscribePost).toBe(false);
  });

  it("keeps precedence and auto-submitted raw values", () => {
    const facts = extractHeaderFacts({ precedence: "bulk", "auto-submitted": "auto-generated" });
    expect(facts.precedence).toBe("bulk");
    expect(facts.autoSubmitted).toBe("auto-generated");
  });

  it("flags noreply senders", () => {
    for (const local of ["noreply", "no-reply", "no_reply", "no.reply", "donotreply", "do-not-reply"]) {
      expect(extractHeaderFacts({ from: `${local}@shop.example` }).isNoreplyFrom).toBe(true);
    }
    for (const local of ["reply", "info", "alice"]) {
      expect(extractHeaderFacts({ from: `${local}@shop.example` }).isNoreplyFrom).toBe(false);
    }
  });

  it("flags replies via in-reply-to or references", () => {
    expect(extractHeaderFacts({ "in-reply-to": "<x@y>" }).isReply).toBe(true);
    expect(extractHeaderFacts({ references: "<x@y> <z@y>" }).isReply).toBe(true);
    expect(extractHeaderFacts({}).isReply).toBe(false);
  });

  it("collects unique dkim domains from all signatures", () => {
    const facts = extractHeaderFacts({
      "dkim-signature": [
        "v=1; a=rsa-sha256; d=mailer.example; s=key1; bh=abc",
        "v=1; a=rsa-sha256; d=Shop.example; s=key2; bh=def",
        "v=1; a=rsa-sha256; d=mailer.example; s=key3; bh=ghi",
      ],
    });
    expect(facts.dkimDomains).toEqual(["mailer.example", "shop.example"]);
  });

  it("keeps the decoded subject", () => {
    expect(extractHeaderFacts({ subject: "Bevestiging réservering" }).subject).toBe(
      "Bevestiging réservering",
    );
  });
});

describe("selectBody", () => {
  it("prefers the text part but keeps links from the html part", () => {
    const body = selectBody({
      headers: {},
      text: "plain",
      html: '<p>zie <a href="https://x.example/u">afmelden</a></p>',
    });
    expect(body.source).toBe("text");
    expect(body.text).toBe("plain");
    expect(body.links).toEqual([{ href: "https://x.example/u", text: "afmelden" }]);
  });

  it("drops a stub text part for the html body it stands in for", () => {
    // What MailChimp and SendGrid send: a one-liner beside the real newsletter.
    const body = selectBody({
      headers: {},
      text: "Your email client doesn't support HTML. View this email online: https://x.example/v",
      html: `<p>${"Real newsletter copy about our summer sale. ".repeat(60)}</p>`,
    });
    expect(body.source).toBe("html");
    expect(body.text).toContain("summer sale");
  });

  it("keeps a short text part when the html part is short too", () => {
    // A terse transactional mail is not a stub, so the cleaner text part wins.
    const body = selectBody({
      headers: {},
      text: "Your verification code is 123456",
      html: "<p>Your verification code is <b>123456</b></p>",
    });
    expect(body.source).toBe("text");
  });

  it("falls back to html converted to text", () => {
    const body = selectBody({
      headers: {},
      html: '<p>Zie <a href="https://shop.example/order">je bestelling</a></p>',
    });
    expect(body.source).toBe("html");
    expect(body.text).toContain("Zie je bestelling");
    expect(body.links).toHaveLength(1);
    expect(body.links[0]?.href).toBe("https://shop.example/order");
  });

  it("returns empty when neither part exists", () => {
    const body = selectBody({ headers: {} });
    expect(body.source).toBe("empty");
    expect(body.text).toBe("");
  });
});
