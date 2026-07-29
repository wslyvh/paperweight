// Quote segmentation: spans of earlier-thread text inside a message body.
// Consumer: detectPii flags findings inside a span as inQuotedText — the
// user's own earlier mail (with their IBAN or address) sits bottom-quoted in
// every vendor reply, and the app de-emphasizes those findings.
export interface Span {
  start: number;
  end: number;
}

// Strict attribution lines; a match marks everything from that line to the
// end of the text as quoted (standard bottom-quote). Precision first: no
// match, no span.
const ATTRIBUTION = [
  /^On .{4,120} wrote:\s*$/,
  /^Op .{4,120} schreef .{0,80}:\s*$/,
  /^Op .{4,120} heeft .{0,80} geschreven:\s*$/,
  /^Am .{4,120} schrieb .{0,80}:\s*$/,
  /^-{2,}\s*(?:Original Message|Oorspronkelijk bericht|Ursprüngliche Nachricht|Forwarded message)\s*-{2,}\s*$/i,
];

export function markQuotedSegments(text: string): Span[] {
  const spans: Span[] = [];
  let offset = 0;
  let run: Span | undefined;
  let prevLine: { start: number; text: string } | undefined;

  for (const line of text.split("\n")) {
    const start = offset;
    offset += line.length + 1;

    if (ATTRIBUTION.some((p) => p.test(line))) {
      spans.push({ start, end: text.length });
      break;
    }
    if (line.startsWith(">")) {
      if (!run) {
        // an attribution-ish "... :" line directly above joins the span
        const joinAbove = prevLine !== undefined && /:\s*$/.test(prevLine.text);
        run = { start: joinAbove ? prevLine!.start : start, end: 0 };
      }
      run.end = start + line.length;
    } else if (run && line.trim() !== "") {
      spans.push(run);
      run = undefined;
    }
    if (line.trim() !== "") prevLine = { start, text: line };
  }
  if (run) spans.push(run);
  return spans;
}

export function inSpan(start: number, spans: Span[]): boolean {
  return spans.some((s) => start >= s.start && start < s.end);
}
