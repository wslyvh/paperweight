// Rule-based message type classifier, v1.
// Always emits a best guess + confidence + the signals that drove it;
// 'unknown' is reserved for empty input. A consumer-provider sender (gmail
// etc.) without list evidence beats everything: organizations send from
// their own domain, so provider mail is a human — even a forwarded receipt
// (assumption: small businesses on gmail are the exception; validate on real
// mailboxes). Purchase beats promotion evidence (platforms send purchase
// mail with unsubscribe headers); a social-network sender beats content
// vocabulary; replies never classify as update (resets/alerts are not
// replies); strong list headers beat incidental update vocabulary.
import { PERSONAL_DOMAINS, SOCIAL_DOMAINS } from "../data/sender-domains";
import { sameOrg } from "../detect/email";
import type { Extracted } from "../extract/body";
import type { MessageType, Signal } from "../types";
import type { UnsubscribeResult } from "./unsubscribe";

export interface TypeResult {
  type: MessageType;
  confidence: number;
  signals: Signal[];
}

export function classifyType(
  extracted: Extracted,
  textSignals: Signal[],
  unsubscribe?: UnsubscribeResult,
): TypeResult {
  const { header, body } = extracted;
  if (body.text.trim() === "" && !header.from) return { type: "unknown", confidence: 0, signals: [] };

  const headerSignals = collectHeaderSignals(extracted);
  const has = (id: string): boolean => headerSignals.some((s) => s.id === id);
  const text = (id: string): Signal[] => textSignals.filter((s) => s.id === id);
  const strongList = has("header.one-click") || has("header.list-id") || has("header.precedence-bulk");

  const personalDomain =
    header.from && !header.isNoreplyFrom && !has("header.list-unsubscribe") && !strongList
      ? PERSONAL_DOMAINS.find((d) => d === header.from!.domain)
      : undefined;
  if (personalDomain) {
    return {
      type: "personal",
      confidence: 0.8,
      signals: [{ id: "sender.personal-domain", detail: personalDomain }],
    };
  }

  const confirmation = text("text.purchase-confirmation");
  const referenceCode = text("text.reference-code");
  const purchaseVocab = text("text.purchase-vocab");
  const amount = text("text.amount");
  if (referenceCode.length > 0 && (confirmation.length > 0 || purchaseVocab.length > 0 || amount.length > 0)) {
    return { type: "purchase", confidence: 0.85, signals: [...referenceCode, ...confirmation, ...purchaseVocab, ...amount] };
  }
  if (confirmation.length > 0) {
    return { type: "purchase", confidence: 0.8, signals: [...confirmation, ...purchaseVocab, ...amount] };
  }
  if (referenceCode.length > 0) {
    return { type: "purchase", confidence: 0.7, signals: referenceCode };
  }
  if (purchaseVocab.length >= 2) {
    return { type: "purchase", confidence: 0.65, signals: [...purchaseVocab, ...amount] };
  }

  const socialDomain = header.from && SOCIAL_DOMAINS.find((d) => sameOrg(d, header.from!.domain));
  if (socialDomain) {
    return {
      type: "social",
      confidence: 0.9,
      signals: [{ id: "sender.social-domain", detail: socialDomain }],
    };
  }

  const updateVocab = text("text.update-vocab");
  const noreplySignals = headerSignals.filter((s) => s.id === "header.noreply-from" || s.id === "header.auto-submitted");
  if (updateVocab.length > 0 && !header.isReply && (noreplySignals.length > 0 || !strongList)) {
    return {
      type: "update",
      confidence: noreplySignals.length > 0 ? 0.7 : 0.6,
      signals: [...updateVocab, ...noreplySignals],
    };
  }

  // Product contract: promotion means actionable bulk mail. List-ID,
  // Precedence: bulk and layout are useful supporting evidence, but without a
  // resolved unsubscribe target they must not put a message on Mailing Lists.
  if (unsubscribe) {
    const listCueIds = new Set([
      "header.list-unsubscribe", "header.one-click", "header.list-id",
      "header.precedence-bulk", "header.dkim-mismatch", "html.bulk-layout",
    ]);
    const cues = headerSignals.filter((s) => listCueIds.has(s.id));
    if (unsubscribe?.method === "footer") cues.push({ id: "unsubscribe.footer", detail: unsubscribe.target });
    const headerBased = has("header.list-unsubscribe") || strongList;
    return {
      type: "promotion",
      confidence: Math.min((headerBased ? 0.75 : 0.7) + (cues.length - 1) * 0.05, 0.9),
      signals: cues,
    };
  }

  const lowStructure =
    body.source === "text" ||
    (extracted.html !== undefined && extracted.html.linkCount <= 2 && extracted.html.imageCount <= 1);
  if (!header.isNoreplyFrom && lowStructure) {
    const cited = headerSignals.filter((s) => s.id === "header.reply");
    cited.push({ id: body.source === "text" ? "body.plain-text" : "html.low-structure" });
    return { type: "personal", confidence: header.isReply ? 0.8 : 0.6, signals: cited };
  }

  return {
    type: header.isNoreplyFrom ? "update" : "personal",
    confidence: 0.4,
    signals: headerSignals,
  };
}

function collectHeaderSignals(extracted: Extracted): Signal[] {
  const { header, html } = extracted;
  const signals: Signal[] = [];
  if (header.listUnsubscribe) signals.push({ id: "header.list-unsubscribe" });
  if (header.listUnsubscribePost) signals.push({ id: "header.one-click" });
  if (header.listId !== undefined) signals.push({ id: "header.list-id", detail: header.listId });
  if (/^(bulk|list)$/i.test(header.precedence ?? "")) signals.push({ id: "header.precedence-bulk" });
  if (header.autoSubmitted !== undefined && !/^no$/i.test(header.autoSubmitted)) {
    signals.push({ id: "header.auto-submitted", detail: header.autoSubmitted });
  }
  if (header.isNoreplyFrom) signals.push({ id: "header.noreply-from" });
  if (header.isReply) signals.push({ id: "header.reply" });
  if (header.from && header.dkimDomains.length > 0 && !header.dkimDomains.some((d) => sameOrg(d, header.from!.domain))) {
    signals.push({ id: "header.dkim-mismatch", detail: header.dkimDomains[0] });
  }
  if (html && (html.linkCount >= 8 || html.imageCount >= 5 || html.tableCount >= 10)) {
    signals.push({ id: "html.bulk-layout" });
  }
  return signals;
}
