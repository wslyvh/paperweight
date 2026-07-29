import { describe, expect, it } from "vitest";
import {
  resolveFooterLink,
  resolveUnsubscribe,
} from "../src/classify/unsubscribe";
import type { ExtractedBody } from "../src/extract/body";
import type { HeaderFacts } from "../src/extract/headers";

function header(partial?: Partial<HeaderFacts>): HeaderFacts {
  return { listUnsubscribePost: false, isNoreplyFrom: false, isReply: false, dkimDomains: [], ...partial };
}

function body(partial?: Partial<ExtractedBody>): ExtractedBody {
  return { text: "", source: "html", links: [], ...partial };
}

describe("resolveUnsubscribe", () => {
  it("returns undefined when nothing is found", () => {
    expect(resolveUnsubscribe(header(), body())).toBeUndefined();
  });

  it("prefers rfc8058 one-click when the header has a url", () => {
    const result = resolveUnsubscribe(
      header({
        listUnsubscribe: { urls: ["https://x.example/u?id=1"], mailtos: ["mailto:u@x.example"] },
        listUnsubscribePost: true,
      }),
      body(),
    );
    expect(result).toEqual({ method: "rfc8058", target: "https://x.example/u?id=1" });
  });

  it("falls back to list-unsubscribe url without one-click", () => {
    const result = resolveUnsubscribe(
      header({ listUnsubscribe: { urls: ["https://x.example/u"], mailtos: [] } }),
      body(),
    );
    expect(result).toEqual({ method: "list-unsubscribe", target: "https://x.example/u" });
  });

  it("does not POST an insecure one-click target", () => {
    const result = resolveUnsubscribe(
      header({
        listUnsubscribe: { urls: ["http://x.example/u"], mailtos: [] },
        listUnsubscribePost: true,
      }),
      body(),
    );
    expect(result).toEqual({
      method: "list-unsubscribe",
      target: "http://x.example/u",
    });
  });

  it("prefers https even when an http target appears first", () => {
    const result = resolveUnsubscribe(
      header({
        listUnsubscribe: {
          urls: ["http://x.example/u", "https://x.example/u"],
          mailtos: [],
        },
      }),
      body(),
    );
    expect(result).toEqual({
      method: "list-unsubscribe",
      target: "https://x.example/u",
    });
  });

  it("retains the body footer link when a header action wins", () => {
    const extracted = body({
      links: [
        {
          href: "https://x.example/body-unsubscribe",
          text: "Unsubscribe",
          start: 42,
          end: 53,
        },
      ],
    });
    const headers = header({
      listUnsubscribe: {
        urls: ["https://x.example/header-unsubscribe"],
        mailtos: [],
      },
    });

    expect(resolveUnsubscribe(headers, extracted)).toEqual({
      method: "list-unsubscribe",
      target: "https://x.example/header-unsubscribe",
    });
    expect(resolveFooterLink(extracted)).toEqual({
      method: "footer",
      target: "https://x.example/body-unsubscribe",
      anchorStart: 42,
    });
  });

  it("uses the mailto when the header has no url", () => {
    const result = resolveUnsubscribe(
      header({ listUnsubscribe: { urls: [], mailtos: ["mailto:unsub@x.example"] }, listUnsubscribePost: true }),
      body(),
    );
    expect(result).toEqual({ method: "list-unsubscribe", target: "mailto:unsub@x.example" });
  });

  it("finds a footer link by anchor text, scanning from the bottom", () => {
    const result = resolveUnsubscribe(
      header(),
      body({
        links: [
          { href: "https://x.example/unsubscribe-info", text: "About unsubscribe laws" },
          { href: "https://x.example/u/token1", text: "Uitschrijven voor de nieuwsbrief" },
        ],
      }),
    );
    expect(result).toEqual({ method: "footer", target: "https://x.example/u/token1" });
  });

  it("matches common footer phrasings", () => {
    for (const text of [
      "Unsubscribe", "unsubscribe here", "Afmelden", "Abmelden",
      "Click here to leave mailing list", "opt out", "Meld u nu af",
      "Update your preferences", "Se désabonner", "Uitschrijven voor de nieuwsbrief",
    ]) {
      const result = resolveUnsubscribe(header(), body({ links: [{ href: "https://x.example/u", text }] }));
      expect(result?.method, text).toBe("footer");
    }
  });

  it("falls back to the href when the link text is generic", () => {
    const result = resolveUnsubscribe(
      header(),
      body({
        links: [
          { href: "https://x.example/offer", text: "click here" },
          { href: "https://x.example/mail/unsubscribe?u=123", text: "click here" },
        ],
      }),
    );
    expect(result).toEqual({ method: "footer", target: "https://x.example/mail/unsubscribe?u=123" });
  });

  it("prefers a text match over an earlier href match", () => {
    const result = resolveUnsubscribe(
      header(),
      body({
        links: [
          { href: "https://x.example/optout?u=1", text: "click here" },
          { href: "https://x.example/edit.php?token=abc", text: "Meld u nu af" },
        ],
      }),
    );
    expect(result?.target).toBe("https://x.example/edit.php?token=abc");
  });

  it("does not treat ordinary links as footer unsubscribe", () => {
    const result = resolveUnsubscribe(
      header(),
      body({ links: [{ href: "https://x.example/order", text: "Bekijk je bestelling" }] }),
    );
    expect(result).toBeUndefined();
  });
});
