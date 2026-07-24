// Vocabulary/structure cues from body text, consumed by classifyType.
// Internal plumbing — not part of the public Analysis output; the signals
// that drive a verdict surface via typeSignals. Lexicons live in
// data/lexicons/ (one file per language).
import { PURCHASE_CONFIRMATION, PURCHASE_VOCAB, UPDATE_VOCAB } from "../data/lexicons";
import type { Signal } from "../types";

// "order/booking/invoice + number/code/reference"-style prefix; the code
// itself is matched case-sensitively afterwards (uppercase or containing a
// digit), so prose like "order number is wrong" never yields a code.
const REFERENCE_PREFIX =
  /\b(?:order|bestell?|boekings?|booking|buchungs?|reserverings?|reservation|transactie|transaction|factuur|invoice|rechnungs?)[-\s]?(?:number|nummer|code|reference|referentie|no\.?|n[°º]|id)\s*[:#]?\s+/gi;

const AMOUNT = /(?:€|\$|£)\s?\d[\d.,]*|\b\d+[.,]\d{2}\s?euros?\b/i;

export function textTypeSignals(text: string): Signal[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const signals: Signal[] = [];

  appendVocab(signals, "text.purchase-confirmation", PURCHASE_CONFIRMATION, lower);
  appendVocab(signals, "text.purchase-vocab", PURCHASE_VOCAB, lower);
  appendVocab(signals, "text.update-vocab", UPDATE_VOCAB, lower);

  for (const prefix of text.matchAll(REFERENCE_PREFIX)) {
    const code = /^([A-Za-z0-9][A-Za-z0-9-]{4,})/.exec(text.slice(prefix.index + prefix[0].length))?.[1];
    if (code && (/\d/.test(code) || code === code.toUpperCase())) {
      signals.push({ id: "text.reference-code", detail: code });
    }
  }

  const amount = AMOUNT.exec(text);
  if (amount) signals.push({ id: "text.amount", detail: amount[0] });

  return signals;
}

function appendVocab(signals: Signal[], id: string, vocab: RegExp[], lower: string): void {
  for (const pattern of vocab) {
    const match = pattern.exec(lower);
    if (match) signals.push({ id, detail: match[0] });
  }
}
