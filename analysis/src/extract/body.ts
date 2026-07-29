// Body selection and the combined extract step. Internal types — never
// re-exported from index.ts.
import { extractHeaderFacts, type HeaderFacts } from "./headers";
import { htmlToText, type HtmlFacts, type HtmlLink, type HtmlToTextResult } from "./html-to-text";
import type { RawMessage } from "../types";

export interface Extracted {
  header: HeaderFacts;
  body: ExtractedBody;
  html?: HtmlFacts;
}

export interface ExtractedBody {
  text: string;
  source: "text" | "html" | "empty";
  links: HtmlLink[];
}

export function extract(msg: RawMessage): Extracted {
  const header = extractHeaderFacts(msg.headers);
  const converted = msg.html !== undefined ? htmlToText(msg.html) : undefined;
  const extracted: Extracted = { header, body: pickBody(msg, converted) };
  if (converted) extracted.html = converted.facts;
  return extracted;
}

export function selectBody(msg: RawMessage): ExtractedBody {
  return pickBody(msg, msg.html !== undefined ? htmlToText(msg.html) : undefined);
}

// Bulk senders (MailChimp, SendGrid) ship a one-line text/plain part beside the
// real html one: "your client doesn't support HTML, view it online". Preferring
// the text part then analyzes that stub instead of the email, so a short text
// part next to a substantial html body loses. Both bounds are deliberately wide:
// a genuine plain alternative renders the same content and is nowhere near this
// small beside a body this large.
const STUB_TEXT_MAX_LENGTH = 600;
const SUBSTANTIAL_HTML_LENGTH = 2000;

function isStubTextPart(text: string, converted: HtmlToTextResult | undefined): boolean {
  return (
    converted !== undefined &&
    text.trim().length < STUB_TEXT_MAX_LENGTH &&
    converted.text.trim().length >= SUBSTANTIAL_HTML_LENGTH
  );
}

// Links are structural facts from the html part and carry over even when the
// text part wins body selection (multipart mail: the unsubscribe footer link
// only exists in the html part).
function pickBody(msg: RawMessage, converted: HtmlToTextResult | undefined): ExtractedBody {
  if (
    msg.text !== undefined &&
    msg.text.trim() !== "" &&
    !isStubTextPart(msg.text, converted)
  ) {
    // HTML link offsets index into the converted HTML text, not this preferred
    // plain part. Keep the unsubscribe facts but drop offsets that would point
    // into the wrong body.
    const links = converted?.links.map(({ href, text }) => ({ href, text })) ?? [];
    return { text: msg.text, source: "text", links };
  }
  if (converted) {
    return { text: converted.text, source: "html", links: converted.links };
  }
  return { text: "", source: "empty", links: [] };
}
