import { describe, expect, it } from "vitest";
import { classifyType } from "../src/classify/type";
import type { Extracted } from "../src/extract/body";
import type { HeaderFacts } from "../src/extract/headers";
import type { HtmlFacts } from "../src/extract/html-to-text";
import type { Signal } from "../src/types";

function extracted(partial?: {
  header?: Partial<HeaderFacts>;
  text?: string;
  source?: "text" | "html" | "empty";
  html?: HtmlFacts;
}): Extracted {
  const result: Extracted = {
    header: {
      from: { address: "info@shop.example", domain: "shop.example" },
      listUnsubscribePost: false,
      isNoreplyFrom: false,
      isReply: false,
      dkimDomains: [],
      ...partial?.header,
    },
    body: { text: partial?.text ?? "Some body text", source: partial?.source ?? "html", links: [] },
  };
  if (partial?.html) result.html = partial.html;
  return result;
}

const orderCode: Signal = { id: "text.reference-code", detail: "845123B7X2C" };
const orderVocab = (term: string): Signal => ({ id: "text.purchase-vocab", detail: term });
const transactionalVocab = (term: string): Signal => ({ id: "text.update-vocab", detail: term });
const amount: Signal = { id: "text.amount", detail: "€ 189,60" };

describe("classifyType", () => {
  it("reserves unknown for empty input", () => {
    const result = classifyType(
      { header: { listUnsubscribePost: false, isNoreplyFrom: false, isReply: false, dkimDomains: [] }, body: { text: "", source: "empty", links: [] } },
      [],
    );
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("always emits a best guess for non-empty input", () => {
    const result = classifyType(extracted(), []);
    expect(result.type).not.toBe("unknown");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies reference code + amount as order with high confidence", () => {
    const result = classifyType(extracted(), [orderCode, amount]);
    expect(result.type).toBe("purchase");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.signals).toContainEqual(orderCode);
  });

  it("classifies a reference code alone as order, less confident", () => {
    const result = classifyType(extracted(), [orderCode]);
    expect(result.type).toBe("purchase");
    expect(result.confidence).toBeLessThan(0.8);
  });

  it("classifies two distinct order-vocabulary hits as order", () => {
    const result = classifyType(extracted(), [orderVocab("bestelling"), orderVocab("verzonden")]);
    expect(result.type).toBe("purchase");
  });

  it("does not classify a single order-vocabulary hit as order", () => {
    const result = classifyType(extracted(), [orderVocab("pakket")]);
    expect(result.type).not.toBe("purchase");
  });

  it("order wins over bulk headers (transactional mail via marketing platforms)", () => {
    const result = classifyType(
      extracted({ header: { listUnsubscribe: { urls: ["https://x/u"], mailtos: [] }, listUnsubscribePost: true } }),
      [orderCode, orderVocab("bestelling")],
    );
    expect(result.type).toBe("purchase");
  });

  it("classifies transactional vocab from a noreply sender as transactional", () => {
    const result = classifyType(
      extracted({ header: { isNoreplyFrom: true } }),
      [transactionalVocab("reservering")],
    );
    expect(result.type).toBe("update");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.signals).toContainEqual({ id: "header.noreply-from" });
  });

  it("classifies transactional vocab with only a weak unsubscribe header as transactional", () => {
    const result = classifyType(
      extracted({ header: { listUnsubscribe: { urls: ["https://x/u"], mailtos: [] } } }),
      [transactionalVocab("afspraak")],
    );
    expect(result.type).toBe("update");
  });

  it("lets strong bulk headers beat incidental transactional vocabulary", () => {
    const result = classifyType(
      extracted({
        header: {
          listUnsubscribe: { urls: ["https://x/u"], mailtos: [] },
          listUnsubscribePost: true,
          listId: "<news.shop.example>",
        },
      }),
      [transactionalVocab("account")],
      {
        method: "rfc8058",
        target: "https://x/u",
      },
    );
    expect(result.type).toBe("promotion");
  });

  it("classifies order-confirmation phrases as order without a code", () => {
    const result = classifyType(extracted(), [{ id: "text.purchase-confirmation", detail: "reserveringsbevestiging" }]);
    expect(result.type).toBe("purchase");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies a footer unsubscribe with no bulk headers as bulk", () => {
    const result = classifyType(extracted(), [], {
      method: "footer",
      target: "https://x.example/unsub",
    });
    expect(result.type).toBe("promotion");
    expect(result.signals).toContainEqual({ id: "unsubscribe.footer", detail: "https://x.example/unsub" });
  });

  it("classifies one-click plus list-id as bulk with strong confidence", () => {
    const result = classifyType(
      extracted({
        header: {
          listUnsubscribe: { urls: ["https://x/u"], mailtos: [] },
          listUnsubscribePost: true,
          listId: "<news.shop.example>",
        },
      }),
      [],
      {
        method: "rfc8058",
        target: "https://x/u",
      },
    );
    expect(result.type).toBe("promotion");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.signals).toContainEqual({ id: "header.one-click" });
    expect(result.signals).toContainEqual({ id: "header.list-id", detail: "<news.shop.example>" });
  });

  it("does not classify list-like headers without an unsubscribe action as promotion", () => {
    for (const header of [
      { listId: "<news.shop.example>" },
      { precedence: "bulk" },
      { listUnsubscribePost: true },
    ]) {
      const result = classifyType(extracted({ header }), []);
      expect(result.type).not.toBe("promotion");
    }
  });

  it("classifies mail from a social network domain as social", () => {
    const result = classifyType(
      extracted({ header: { from: { address: "jobs-listings@linkedin.com", domain: "linkedin.com" } } }),
      [],
    );
    expect(result.type).toBe("social");
    expect(result.signals).toContainEqual({ id: "sender.social-domain", detail: "linkedin.com" });
  });

  it("matches social subdomains too", () => {
    const result = classifyType(
      extracted({ header: { from: { address: "x@e.linkedin.com", domain: "e.linkedin.com" } } }),
      [],
    );
    expect(result.type).toBe("social");
  });

  it("lets purchase evidence beat a social sender (premium receipts)", () => {
    const result = classifyType(
      extracted({ header: { from: { address: "billing@linkedin.com", domain: "linkedin.com" } } }),
      [orderCode, amount],
    );
    expect(result.type).toBe("purchase");
  });

  it("lets a consumer-provider sender beat purchase evidence (forwarded receipts)", () => {
    const result = classifyType(
      extracted({ header: { from: { address: "jamie.park@gmail.com", domain: "gmail.com" } } }),
      [orderCode, amount],
    );
    expect(result.type).toBe("personal");
    expect(result.signals).toContainEqual({ id: "sender.personal-domain", detail: "gmail.com" });
  });

  it("classifies mail from a consumer provider as personal despite update vocab", () => {
    const result = classifyType(
      extracted({ header: { from: { address: "jamie.park@gmail.com", domain: "gmail.com" } } }),
      [transactionalVocab("reminder")],
    );
    expect(result.type).toBe("personal");
    expect(result.signals).toContainEqual({ id: "sender.personal-domain", detail: "gmail.com" });
  });

  it("does not let a consumer-provider sender override list evidence (groups, forwards-as-list)", () => {
    const result = classifyType(
      extracted({
        header: {
          from: { address: "someone@gmail.com", domain: "gmail.com" },
          listUnsubscribe: { urls: ["https://x/u"], mailtos: [] },
          listId: "<talk.groups.example>",
        },
      }),
      [],
      {
        method: "list-unsubscribe",
        target: "https://x/u",
      },
    );
    expect(result.type).toBe("promotion");
  });

  it("does not classify a reply as update on vocabulary alone", () => {
    const result = classifyType(
      extracted({ header: { isReply: true }, source: "text" }),
      [transactionalVocab("herinnering")],
    );
    expect(result.type).toBe("personal");
  });

  it("classifies plain-text mail from a person as personal, boosted by reply headers", () => {
    const fresh = classifyType(
      extracted({ header: { from: { address: "sam@rivers.example", domain: "rivers.example" } }, source: "text" }),
      [],
    );
    expect(fresh.type).toBe("personal");

    const reply = classifyType(
      extracted({ header: { from: { address: "sam@rivers.example", domain: "rivers.example" }, isReply: true }, source: "text" }),
      [],
    );
    expect(reply.type).toBe("personal");
    expect(reply.confidence).toBeGreaterThan(fresh.confidence);
    expect(reply.signals).toContainEqual({ id: "header.reply" });
  });

  it("falls back to transactional for noreply senders with no other evidence", () => {
    const result = classifyType(extracted({ header: { isNoreplyFrom: true } }), []);
    expect(result.type).toBe("update");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
