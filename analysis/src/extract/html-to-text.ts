// HTML-to-text for email bodies. Tokenizing and entity decoding are
// htmlparser2's job (the only file importing it). What no library provides —
// verified against cheerio .text() (no structure, css leaks) and the
// html-to-text package (inlines raw urls into the text) — is our output
// shape: clean prose for the detectors (no tags, no urls) plus links and
// structure facts separately for the classifiers.
import { Parser } from "htmlparser2";

export interface HtmlLink {
  href: string;
  text: string;
  /** Offsets into `HtmlToTextResult.text`. Only meaningful when that converted
   *  HTML text is the body selected for analysis. */
  start?: number;
  end?: number;
}

export interface HtmlFacts {
  linkCount: number;
  imageCount: number;
  visibleTextLength: number;
  tableCount: number;
}

export interface HtmlToTextResult {
  text: string;
  links: HtmlLink[];
  facts: HtmlFacts;
}

const SKIP_TAGS = new Set(["script", "style", "head", "title", "noscript", "template"]);

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "div", "dl", "dd", "dt",
  "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table",
  "tbody", "thead", "tfoot", "tr", "ul",
]);

// Invisible characters (soft hyphen, zero-width joiners, word joiner, BOM):
// marketing mail pads its preview text with thousands of them, which skews
// language detection and text-density signals.
const INVISIBLE = /[\u00AD\u034F\u200B-\u200D\u2060\uFEFF]/g;

export function htmlToText(html: string): HtmlToTextResult {
  let out = "";
  const links: HtmlLink[] = [];
  const facts: HtmlFacts = { linkCount: 0, imageCount: 0, visibleTextLength: 0, tableCount: 0 };
  let pendingNewlines = 0;
  let pendingSpace = false;
  let skipDepth = 0;
  let link: { href: string; parts: string[]; start?: number; end?: number } | undefined;

  function flush(): void {
    if (pendingNewlines > 0) {
      if (out) out += "\n".repeat(Math.min(pendingNewlines, 2));
    } else if (pendingSpace && out && !out.endsWith("\n")) {
      out += " ";
    }
    pendingNewlines = 0;
    pendingSpace = false;
  }

  const parser = new Parser({
    onopentag(name, attributes) {
      if (SKIP_TAGS.has(name)) {
        skipDepth++;
        return;
      }
      if (skipDepth > 0) return;
      if (name === "br") {
        pendingNewlines = Math.min(pendingNewlines + 1, 2);
        return;
      }
      if (name === "img") {
        facts.imageCount++;
        return;
      }
      if (name === "table") facts.tableCount++;
      if (name === "a") {
        const href = attributes["href"];
        if (href) {
          facts.linkCount++;
          link = { href, parts: [] };
        }
        return;
      }
      if (name === "td" || name === "th") {
        pendingSpace = true;
        return;
      }
      if (BLOCK_TAGS.has(name)) pendingNewlines = Math.max(pendingNewlines, 1);
    },
    onclosetag(name) {
      if (SKIP_TAGS.has(name)) {
        if (skipDepth > 0) skipDepth--;
        return;
      }
      if (skipDepth > 0) return;
      if (name === "a") {
        const text = link?.parts.join(" ").trim();
        if (
          link &&
          text &&
          link.start !== undefined &&
          link.end !== undefined
        ) {
          links.push({
            href: link.href,
            text,
            start: link.start,
            end: link.end,
          });
        }
        link = undefined;
        return;
      }
      if (BLOCK_TAGS.has(name)) pendingNewlines = Math.max(pendingNewlines, 1);
    },
    ontext(data) {
      if (skipDepth > 0) return;
      const collapsed = data.replace(INVISIBLE, "").replace(/\s+/g, " ");
      const trimmed = collapsed.trim();
      if (!trimmed) {
        if (collapsed) pendingSpace = true;
        return;
      }
      if (collapsed.startsWith(" ")) pendingSpace = true;
      flush();
      const start = out.length;
      out += trimmed;
      if (link) {
        link.start ??= start;
        link.end = out.length;
        link.parts.push(trimmed);
      }
      if (collapsed.endsWith(" ")) pendingSpace = true;
    },
  });

  parser.write(html);
  parser.end();

  facts.visibleTextLength = out.length;
  return { text: out, links, facts };
}
