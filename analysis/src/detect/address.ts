// Address blocks: postcode-anchored only. A street
// pattern within ~120 chars of a postcode candidate of the same country
// emits the whole span as one address finding, extended over a trailing
// city token when the postcode ends the block. Anchor-only postcodes (bare
// digit codes) additionally require a city token directly after them —
// years and reference numbers never have one. Freestanding street names
// never fire (stage-2 NER territory).
// Wave-1 grammars follow the language matrix (one country set per lexicon language): NL, GB, DE(+AT),
// FR(+BE, with NL), ES, IT, PT, US.
import type { Finding } from "../types";
import type { PostalCandidate } from "./postal-code";

interface StreetSpec {
  country: string;
  pattern: RegExp;
}

// NL/DE house numbers may carry a 1-2 letter suffix ("12 zw", "7 a") — only
// when a line/segment break follows, so prose like "nummer 12 is" stays out.
const HOUSE_NUMBER = String.raw`\d+[a-zA-Z]?(?:[-/]\d*\w?)?(?:\s[a-zA-Z]{1,2}(?=\s*[\n,]))?`;

// shared /g patterns are safe: String.matchAll clones the regex
const NL_STREET = new RegExp(
  String.raw`\b(?:(?:[A-Z][\w'.-]*|van|de|der|den|het|ten|ter)\s+){0,3}[A-Z][a-zë]*` +
    `(?:straat|weg|laan|plein|gracht|kade|dijk|singel|hof|pad|markt|steeg|dreef|erf|kamp|spoor|veld|akker|gaarde|horst|donk|hoek|werf|zoom|oord|baan|wal|dam)` +
    String.raw`\s+${HOUSE_NUMBER}`,
  "g",
);

// suffix streets (Musterstrasse 9) or preposition streets
// (Am Beispielufer 7, Unter den Musterlinden 5)
const DE_STREET = new RegExp(
  String.raw`\b(?:(?:Am|An der|Auf dem|Auf der|Im|In der|Unter den|Zum|Zur)\s+(?:[A-Z][\wäöüß-]*\s+)?[A-Z][\wäöüß-]*|(?:[A-Z][\wäöüß'.-]*\s+){0,2}[A-Z][a-zäöüß]*(?:straße|strasse|str\.|weg|platz|allee|gasse|ring|damm|ufer|hof|markt|berg|tor))` +
    String.raw`\s+${HOUSE_NUMBER}`,
  "g",
);

// number-first (12 rue de la Paix); the street-type word is lowercase in
// running French, so it anchors the pattern together with the capitalized name
const FR_STREET =
  /\b\d+(?:\s(?:bis|ter))?,?\s+(?:[Rr]ue|[Aa]venue|[Bb]oulevard|[Pp]lace|[Cc]hemin|[Aa]ll[ée]e|[Ii]mpasse|[Qq]uai|[Cc]ours)\s+(?:(?:de|du|des|la|le)\s+|l'){0,2}[A-ZÀ-Ü][\w'à-ü-]*/g;

const STREETS: StreetSpec[] = [
  { country: "NL", pattern: NL_STREET },
  {
    country: "GB",
    pattern:
      /\b\d+[a-zA-Z]?\s+(?:[A-Z][a-z']+\s+){1,3}(?:Street|Road|Lane|Avenue|Close|Drive|Court|Place|Way|Terrace|Gardens|Crescent|Square|Hill|Row|Walk|Mews)\b/g,
  },
  { country: "DE", pattern: DE_STREET },
  { country: "AT", pattern: DE_STREET },
  { country: "FR", pattern: FR_STREET },
  { country: "BE", pattern: NL_STREET },
  { country: "BE", pattern: FR_STREET },
  {
    country: "ES",
    pattern:
      /\b(?:Calle|Avenida|Avda\.?|Av\.?|Plaza|Paseo|Camino|C\/)\s*(?:(?:de la|del|de|los|las|la)\s+){0,2}[A-ZÁ-Ú][\w'á-ú-]*(?:\s+[A-ZÁ-Ú][\w'á-ú-]*)?,?\s+(?:n[º°]\s*)?\d+/g,
  },
  {
    country: "IT",
    pattern:
      /\b(?:Via|Viale|Piazza|Corso|Vicolo|Largo)\s+(?:(?:della|delle|degli|del|dei|di|San|Santa)\s+){0,2}[A-ZÀ-Ù][\w'à-ù-]*(?:\s+[A-ZÀ-Ù][\w'à-ù-]*)?,?\s+\d+/g,
  },
  {
    country: "PT",
    pattern:
      /\b(?:Rua|Avenida|Av\.|Pra[çc]a|Travessa|Largo|Estrada)\s+(?:(?:de|do|da|dos|das)\s+){0,2}[A-ZÁ-Ú][\w'á-ú-]*(?:\s+[A-ZÁ-Ú][\w'á-ú-]*)?,?\s+(?:n\.?[º°]?\s*)?\d+/g,
  },
  {
    country: "US",
    pattern:
      /\b\d+[A-Za-z]?\s+(?:[A-Z][\w'.-]*\s+){1,3}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Terrace|Circle|Cir|Parkway|Pkwy|Highway|Hwy)\b\.?/g,
  },
];

const MAX_GAP = 60; // chars between street and postcode (~one line)
// A real address block is short. Anything longer means the street and the
// postcode belong to different things with prose in between.
const MAX_SPAN = 120;
const COPYRIGHT_BOUNDARY = /(?:©|\(c\)|copyright)/i;

// a trailing city: one capitalized token, or two when the first is a known
// multi-word-city particle (Den Haag, New York)
const CITY =
  /^[ \t]*,?[ \t]*((?:(?:Den|De|Het|Sint|New|Los|San|Las|Fort|Mount|Saint|Bad)[ \t])?[A-Z][\w'-]+)/;

export function detectAddressBlocks(text: string, candidates: PostalCandidate[]): Finding[] {
  const findings: Finding[] = [];
  for (const pc of candidates) {
    if (pc.tier === "anchor-only" && !CITY.test(text.slice(pc.end))) continue;
    const specs = STREETS.filter((s) => s.country === pc.country);
    const sameCountry = candidates.filter((c) => c.country === pc.country);
    let best: { start: number; end: number; street: string; gap: number } | undefined;
    for (const spec of specs) {
      for (const m of text.matchAll(spec.pattern)) {
        const mEnd = m.index + m[0].length;
        // A house number is not a postcode. When the street match swallows any
        // postcode of this country — "Orchestrator 2012" reading a bare code as
        // its number, or a US street pattern taking a leading ZIP as one — the
        // block is a coincidence between two patterns, not an address.
        if (sameCountry.some((c) => m.index < c.end && c.start < mEnd)) continue;
        const gap = m.index >= pc.end ? m.index - pc.end : pc.start - mEnd;
        if (gap > MAX_GAP) continue;
        const between =
          m.index >= pc.end
            ? text.slice(pc.end, m.index)
            : text.slice(mEnd, pc.start);
        // A copyright year can satisfy a country's bare numeric postcode
        // pattern, with the company name after it mistaken for a city. A
        // copyright marker between the street and candidate proves they are
        // separate blocks, regardless of the number itself.
        if (COPYRIGHT_BOUNDARY.test(between)) continue;
        if (!best || gap < best.gap) {
          // The span starts at the street, never before it. Whatever precedes —
          // a year, a label ("adres:"), a person's name, or a postcode written
          // above the street — is context that anchors the block, not part of
          // the address, and letting it in is what splits one company HQ into
          // several differently-formatted rows.
          best = { start: m.index, end: Math.max(mEnd, pc.end), street: m[0], gap };
        }
      }
    }
    if (!best) continue;
    if (best.end === pc.end) {
      const city = CITY.exec(text.slice(pc.end));
      if (city) best.end = pc.end + city[0].length;
    }
    if (best.end - best.start > MAX_SPAN) continue;
    findings.push({
      type: "address",
      valueRaw: text.slice(best.start, best.end),
      valueNormalized: normalizeAddress(text.slice(best.start, best.end)),
      start: best.start,
      end: best.end,
      confidence: "contextual",
      country: pc.country,
      signals: [
        { id: "anchor.postal-code", detail: pc.value },
        { id: "pattern.street", detail: best.street },
      ],
    });
  }
  return findings;
}

// One address written twice differs by punctuation, case and line breaks far
// more often than by content, and each variant would otherwise be its own row.
// Strip to letters, digits and single spaces; valueRaw keeps the original.
// Exported so anything comparing an address against a finding reduces both
// sides with this exact function rather than a copy that can drift from it.
export function normalizeAddress(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
