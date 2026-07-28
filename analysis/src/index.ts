import { textTypeSignals } from "./classify/text-signals";
import { classifyType } from "./classify/type";
import {
  resolveFooterLink,
  resolveUnsubscribe,
} from "./classify/unsubscribe";
import { detectPii } from "./detect";
import { regionFromDomain } from "./detect/phone";
import { markFooterSegments } from "./detect/footer";
import { markQuotedSegments } from "./detect/quotes";
import { extract } from "./extract/body";
import { detectLanguage } from "./extract/language";
import type {
  Analysis,
  AnalyzeMessageOptions,
  AnalyzeOptions,
  RawMessage,
  TextAnalysis,
} from "./types";

export * from "./types";
export { parseEml } from "./parse/eml";
export {
  isSupportedCountryCode,
  normalizeCountryCode,
} from "./country";
export {
  extractKnownAddressComponents,
  normalizeValue,
  validateValue,
} from "./profile-values";
// The sender-domain → region resolver (ccTLD, with uk→GB etc.). Exposed so a
// consumer analyzing stored bodies can supply the same phone/postcode region
// hint that analyzeMessage derives internally, without reimplementing it.
export { regionFromDomain } from "./detect/phone";
// Match a finding against the sending organization's own contact details. A
// consumer with a company catalogue owns the lookup; the comparison — and the
// normalization both sides are reduced with — stays here.
export { isSenderContact } from "./detect/sender-contact";
export type { SenderContacts } from "./detect/sender-contact";
// Public webmail/ISP domains. Also on ./contracts, which is where a consumer
// that only wants the vocabulary should import it from — that entry point is
// dependency-free and safe to bundle into a renderer.
export { PERSONAL_DOMAINS } from "./contracts";

// Engine version. It tracks the FINDINGS contract: a consumer persists it on
// every analyzed message and re-analyzes when it changes, so ANY detector or
// normalization change MUST bump this or existing findings go stale and never
// re-analyze. Compared for inequality, never ordering — it is a cache key, not
// a precedence rank — and kept in step with package.json. Message-type
// classification is deliberately outside the contract: type is not versioned
// per row, so a classifier change reaches stored rows through a release
// migration instead of through this constant. (See README → Contract.)
export const ENGINE_VERSION = "0.1.0";

// AnalyzeOptions.locale ("NL", "nl", "nl-NL") -> ISO 3166-1 alpha-2 region
function regionFromLocale(locale?: string): string | undefined {
  const tag = locale?.split(/[-_]/).pop();
  return tag && /^[A-Za-z]{2}$/.test(tag) ? tag.toUpperCase() : undefined;
}

export async function analyzeText(text: string, opts?: AnalyzeOptions): Promise<TextAnalysis> {
  return analyzeTextWithFooter(
    text,
    markFooterSegments(text, undefined, opts?.footerLinkPresent),
    opts,
  );
}

async function analyzeTextWithFooter(
  text: string,
  footer: ReturnType<typeof markFooterSegments>,
  opts?: AnalyzeOptions,
): Promise<TextAnalysis> {
  const findings = detectPii(text, {
    quoted: markQuotedSegments(text),
    footer,
    region: regionFromLocale(opts?.locale),
    ownEmails: opts?.ownIdentifiers?.emails,
    knownValues: opts?.knownValues,
    senderDomain: opts?.senderDomain,
  });
  return { version: ENGINE_VERSION, lang: detectLanguage(text), findings };
}

export async function analyzeMessage(
  msg: RawMessage,
  opts?: AnalyzeMessageOptions,
): Promise<Analysis> {
  const extracted = extract(msg);
  const resolvedUnsubscribe = resolveUnsubscribe(extracted.header, extracted.body);
  const footerLink =
    resolvedUnsubscribe?.method === "footer"
      ? resolvedUnsubscribe
      : resolveFooterLink(extracted.body);
  const unsubscribe = resolvedUnsubscribe ?? opts?.knownUnsubscribe;
  const maxTextLength = opts?.maxTextLength;
  const textTruncated =
    maxTextLength !== undefined &&
    maxTextLength >= 0 &&
    extracted.body.text.length > maxTextLength;
  const text = textTruncated
    ? extracted.body.text.slice(0, maxTextLength)
    : extracted.body.text;
  // phone/postcode region: explicit locale, else the sender's ccTLD
  const locale = opts?.locale ?? regionFromDomain(extracted.header.from?.domain);
  const senderDomain = opts?.senderDomain ?? extracted.header.from?.domain;
  const footerAnchor =
    extracted.body.source === "html" &&
    footerLink?.anchorStart !== undefined &&
    footerLink.anchorStart < text.length
      ? footerLink.anchorStart
      : undefined;
  const textAnalysis = await analyzeTextWithFooter(
    text,
    markFooterSegments(
      text,
      footerAnchor,
      footerAnchor === undefined &&
        (footerLink !== undefined || unsubscribe?.method === "footer"),
    ),
    { ...opts, locale, senderDomain },
  );
  // Type signals read the subject as well as the body: it is the densest line
  // for message type, and for a message held without a body it is the only text
  // there is. Findings never see it — analyzeText above ran on the body alone,
  // so offsets stay body-relative.
  const typeText = extracted.header.subject
    ? `${extracted.header.subject}\n${text}`
    : text;
  const type = classifyType(extracted, textTypeSignals(typeText), unsubscribe);
  const analysis: Analysis = {
    ...textAnalysis,
    text,
    type: type.type,
    typeConfidence: type.confidence,
    typeSignals: type.signals,
  };
  if (textTruncated) analysis.textTruncated = true;
  if (unsubscribe) {
    analysis.unsubscribe = {
      method: unsubscribe.method,
      target: unsubscribe.target,
    };
  }
  return analysis;
}
