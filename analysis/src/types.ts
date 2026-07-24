// Public contract of @paperweight/analysis. This file and the test suite are
// the source of truth; README.md describes boundaries and intent only.
import type { FindingType, MessageType } from "./contracts";

export {
  ACCOUNT_MESSAGE_TYPES,
  FINDING_SENSITIVITY_ORDER,
  FINDING_TYPES,
  LIST_MESSAGE_TYPES,
  MESSAGE_TYPES,
} from "./contracts";
export type { FindingType, MessageType } from "./contracts";

export interface RawMessage {
  headers: Record<string, string | string[]>;
  html?: string;
  text?: string;
}

export interface AnalyzeOptions {
  ownIdentifiers?: { emails?: string[] };
  locale?: string; // region hint for phone/postcode detection ("NL", "nl-NL")
  // Sender's domain, for the selfReference tag. analyzeMessage fills it from
  // the From header; a consumer analyzing stored text supplies it the same way
  // it supplies locale.
  senderDomain?: string;
  /** A consumer re-analyzing stored text knows the original HTML contained a
   * resolved footer link, even when it did not retain the HTML/link offsets. */
  footerLinkPresent?: boolean;
}

export interface AnalyzeMessageOptions extends AnalyzeOptions {
  /** Maximum converted body characters to classify, detect and return. */
  maxTextLength?: number;
  /** Previously resolved unsubscribe fact for re-analysis without raw HTML. */
  knownUnsubscribe?: { method: UnsubscribeMethod; target: string };
}

// Gmail-inspired, content-intent only (the unsubscribe mechanism is its own
// field). 'unknown' is reserved for empty/unparseable input; the classifier
// otherwise always emits its best guess with a confidence.
// purchase  — transaction records: orders, receipts, invoices, payments,
//             refunds, booking/reservation confirmations
// update    — account/service lifecycle: welcome, verification, security,
//             reminders, service notifications
// promotion — marketing, newsletters, offers
// social    — social network notifications
// personal  — 1:1 human mail
export type UnsubscribeMethod = "rfc8058" | "list-unsubscribe" | "footer";

export interface Signal {
  id: string;
  detail?: string;
}

// verified: real checksum passed (Luhn, mod-97, elfproef, ...)
// pattern: strict distinctive format, no checksum exists
// contextual: heuristic that needed surrounding context to qualify
export type Confidence = "verified" | "pattern" | "contextual";

export interface Finding {
  type: FindingType;
  valueRaw: string;
  valueNormalized: string;
  start: number;
  end: number;
  confidence: Confidence;
  country?: string;
  signals: Signal[];
  inQuotedText?: boolean;
  // Inside the message's closing boilerplate block — a company's own contact
  // details rather than anything about the reader.
  inFooter?: boolean;
  isOwnIdentifier?: boolean;
  // An email finding at the sender's own domain (support@acme.com in mail from
  // acme.com). Real, and never the reader's data.
  selfReference?: boolean;
}

export interface TextAnalysis {
  version: string; // engine version; consumers re-analyze stored text when it changes
  lang: string; // ISO 639-3 straight from detection ("eng", "nld"); "und" = undetermined
  findings: Finding[];
}

export interface Analysis extends TextAnalysis {
  // The body text that was analyzed, after source selection (text part wins,
  // else the html conversion). Findings offsets are relative to THIS string, so
  // a consumer storing the body must store this one for the offsets to hold.
  text: string;
  /** The converted body exceeded maxTextLength and `text` is its prefix. */
  textTruncated?: boolean;
  type: MessageType;
  typeConfidence: number;
  typeSignals: Signal[];
  unsubscribe?: { method: UnsubscribeMethod; target: string };
}
