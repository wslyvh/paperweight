// Footer segmentation: the boilerplate block that closes a message —
// unsubscribe line, legal and company details, "you are receiving this
// because". Consumer: detectPii flags findings inside a span as inFooter. A
// company's own postal address, switchboard number and support mailbox sit
// there in almost every bulk send; they are the company's data, not evidence
// about the user.
//
// Same shape and same discipline as quotes.ts: one span running to the end of
// the text, precision first — no cue, no span.
import { FOOTER_CUE, UNSUBSCRIBE_LINK_TEXT } from "../data/lexicons";
import type { Span } from "./quotes";

// Language-independent boilerplate marks, alongside the per-language cues.
const UNIVERSAL_CUES = [/©/, /\(c\)\s*\d{4}/i, /\bcopyright\b/i];

// A footer may only open in the last stretch of the body. Without this a
// newsletter that writes the word "unsubscribe" in its opening paragraph would
// mark its entire contents as footer.
//
// Half, not a smaller fraction: a short order mail with a long contact block
// puts its genuine cue near the middle, and a tighter window discards that cue
// and then opens the footer on the © line below it — flagging nothing that
// matters while still calling the tail a footer. See the footer-contact-block
// fixture, which pins exactly that geometry.
const FOOTER_WINDOW = 0.5;

export function markFooterSegments(
  text: string,
  anchorStart?: number,
  footerLinkPresent = false,
): Span[] {
  if (!text) return [];
  const threshold = Math.floor(text.length * FOOTER_WINDOW);
  const anchor =
    anchorStart === undefined
      ? undefined
      : Math.max(0, text.lastIndexOf("\n", anchorStart - 1) + 1);

  // Offline re-analysis no longer has HTML offsets, but the consumer can carry
  // forward the structural fact that a footer link was resolved. Recover its
  // visible line bottom-up with the same link vocabulary; no percentage or
  // likelihood score is involved.
  if (anchor === undefined && footerLinkPresent) {
    const lines = linesWithOffsets(text);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (
        line &&
        UNSUBSCRIBE_LINK_TEXT.some((pattern) => pattern.test(line.text))
      ) {
        return [{ start: line.start, end: text.length }];
      }
    }
  }

  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset;
    offset += line.length + 1;
    // A resolved unsubscribe link is structural proof that this line belongs
    // to the footer. It may sit before the percentage window in short messages,
    // so it deliberately bypasses that fallback's threshold.
    if (anchor !== undefined && start === anchor) {
      return [{ start, end: text.length }];
    }
    if (start < threshold) continue;
    if (isFooterCue(line)) return [{ start, end: text.length }];
  }
  return [];
}

function linesWithOffsets(text: string): Array<{ text: string; start: number }> {
  let offset = 0;
  return text.split("\n").map((line) => {
    const item = { text: line, start: offset };
    offset += line.length + 1;
    return item;
  });
}

function isFooterCue(line: string): boolean {
  if (line.trim() === "") return false;
  return (
    UNIVERSAL_CUES.some((p) => p.test(line)) ||
    FOOTER_CUE.some((p) => p.test(line)) ||
    UNSUBSCRIBE_LINK_TEXT.some((p) => p.test(line))
  );
}
