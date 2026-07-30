// Address blocks: postcode-anchored only. A street (or PO box / freepost
// reply keyword, which anchors a block the same way without a street name)
// pattern within ~120 chars of a postcode candidate of the same country
// emits the whole span as one address finding, extended over a trailing
// city token when the postcode ends the block. Anchor-only postcodes (bare
// digit codes) additionally require a city token directly after them —
// years and reference numbers never have one. Freestanding street names
// never fire (stage-2 NER territory).
// Wave-1 grammars follow the language matrix (one country set per lexicon language): NL, GB, DE(+AT),
// FR(+BE, with NL), ES, IT, PT, US.
import type { Finding, KnownAddressComponents } from "../types";
import {
  canonicalizePostalCodesInAddress,
  findPostalCodesInAddress,
  type PostalCandidate,
} from "./postal-code";

interface AnchorSpec {
  country: string;
  pattern: RegExp;
  kind: "street" | "box";
}

// NL/DE house numbers may carry a 1-2 letter suffix ("12 zw", "7 a") — only
// when a line/segment break follows, so prose like "nummer 12 is" stays out.
const HOUSE_NUMBER = String.raw`\d+[a-zA-Z]?(?:[-/]\d*\w?)?(?:\s[a-zA-Z]{1,2}(?=\s*[\n,]))?`;

// Street names take leading words ("Jan van Galenstraat"), but only on their own
// line: `\s+` here let the pattern reach back over a newline and swallow the
// sender's name from the line above ("ShopExample B.V.\nHerengracht 45"). A line
// break is structural proof of a separate block, the same reasoning the address
// block applies to a copyright marker.
const SAME_LINE = String.raw`[^\S\n]+`;

// shared /g patterns are safe: String.matchAll clones the regex
const NL_STREET = new RegExp(
  String.raw`\b(?:(?:[A-Z][\w'.-]*|van|de|der|den|het|ten|ter)${SAME_LINE}){0,3}[A-Z][a-zë]*` +
    `(?:straat|weg|laan|plein|gracht|kade|dijk|singel|hof|pad|markt|steeg|dreef|erf|kamp|spoor|veld|akker|gaarde|horst|donk|hoek|werf|zoom|oord|baan|wal|dam)` +
    String.raw`\s+${HOUSE_NUMBER}`,
  "g",
);

// suffix streets (Musterstrasse 9) or preposition streets
// (Am Beispielufer 7, Unter den Musterlinden 5)
const DE_STREET = new RegExp(
  String.raw`\b(?:(?:Am|An der|Auf dem|Auf der|Im|In der|Unter den|Zum|Zur)${SAME_LINE}(?:[A-Z][\wäöüß-]*${SAME_LINE})?[A-Z][\wäöüß-]*|(?:[A-Z][\wäöüß'.-]*${SAME_LINE}){0,2}[A-Z][a-zäöüß]*(?:straße|strasse|str\.|weg|platz|allee|gasse|ring|damm|ufer|hof|markt|berg|tor))` +
    String.raw`\s+${HOUSE_NUMBER}`,
  "g",
);

// number-first (12 rue de la Paix); the street-type word is lowercase in
// running French, so it anchors the pattern together with the capitalized name
const FR_STREET =
  /\b\d+(?:\s(?:bis|ter))?,?\s+(?:[Rr]ue|[Aa]venue|[Bb]oulevard|[Pp]lace|[Cc]hemin|[Aa]ll[ée]e|[Ii]mpasse|[Qq]uai|[Cc]ours)\s+(?:(?:de|du|des|la|le)\s+|l'){0,2}[A-ZÀ-Ü][\w'à-ü-]*/g;

// PO box and freepost-reply addresses ("Postbus 2572", "Antwoordnummer 12345")
// carry no street name — the keyword itself anchors the block, matched
// case-insensitively since running Dutch prose lowercases it
// ("postbus 2572, 3500 GN Utrecht").
const NL_BOX = /\b(?:postbus|antwoordnummer)\s+\d+\b/gi;

// "PO Box 1234" / "P.O. Box 1234" — shared GB/US convention.
const EN_BOX = /\bP\.?\s?O\.?\s?Box\s+\d+\b/gi;

// "Postfach 1234"
const DE_BOX = /\bPostfach\s+\d+\b/gi;

// "BP 1234", "B.P. 1234", "Boîte postale 1234"
const FR_BOX = /\b(?:BP|B\.P\.|Bo[iî]te postale)\s*\d+\b/gi;

// "Apartado 1234", "Apartado de correos 1234", "Apdo. 1234" (ES/PT)
const IBERIAN_BOX = /\b(?:Apartado(?:\s+de\s+correos)?|Apdo\.?)\s+(?:n[º°]\.?\s*)?\d+\b/gi;

// "Casella Postale 1234", "C.P. 1234"
const IT_BOX = /\bCasella Postale\s+\d+\b/gi;

const ANCHORS: AnchorSpec[] = [
  { country: "NL", pattern: NL_STREET, kind: "street" },
  { country: "NL", pattern: NL_BOX, kind: "box" },
  {
    country: "GB",
    kind: "street",
    pattern:
      /\b\d+[a-zA-Z]?\s+(?:[A-Z][a-z']+\s+){1,3}(?:Street|Road|Lane|Avenue|Close|Drive|Court|Place|Way|Terrace|Gardens|Crescent|Square|Hill|Row|Walk|Mews)\b/g,
  },
  { country: "GB", pattern: EN_BOX, kind: "box" },
  { country: "DE", pattern: DE_STREET, kind: "street" },
  { country: "DE", pattern: DE_BOX, kind: "box" },
  { country: "AT", pattern: DE_STREET, kind: "street" },
  { country: "AT", pattern: DE_BOX, kind: "box" },
  { country: "FR", pattern: FR_STREET, kind: "street" },
  { country: "FR", pattern: FR_BOX, kind: "box" },
  { country: "BE", pattern: NL_STREET, kind: "street" },
  { country: "BE", pattern: NL_BOX, kind: "box" },
  { country: "BE", pattern: FR_STREET, kind: "street" },
  { country: "BE", pattern: FR_BOX, kind: "box" },
  {
    country: "ES",
    kind: "street",
    pattern:
      /\b(?:Calle|Avenida|Avda\.?|Av\.?|Plaza|Paseo|Camino|C\/)\s*(?:(?:de la|del|de|los|las|la)\s+){0,2}[A-ZÁ-Ú][\w'á-ú-]*(?:\s+[A-ZÁ-Ú][\w'á-ú-]*)?,?\s+(?:n[º°]\s*)?\d+/g,
  },
  { country: "ES", pattern: IBERIAN_BOX, kind: "box" },
  {
    country: "IT",
    kind: "street",
    pattern:
      /\b(?:Via|Viale|Piazza|Corso|Vicolo|Largo)\s+(?:(?:della|delle|degli|del|dei|di|San|Santa)\s+){0,2}[A-ZÀ-Ù][\w'à-ù-]*(?:\s+[A-ZÀ-Ù][\w'à-ù-]*)?,?\s+\d+/g,
  },
  { country: "IT", pattern: IT_BOX, kind: "box" },
  {
    country: "PT",
    kind: "street",
    pattern:
      /\b(?:Rua|Avenida|Av\.|Pra[çc]a|Travessa|Largo|Estrada)\s+(?:(?:de|do|da|dos|das)\s+){0,2}[A-ZÁ-Ú][\w'á-ú-]*(?:\s+[A-ZÁ-Ú][\w'á-ú-]*)?,?\s+(?:n\.?[º°]?\s*)?\d+/g,
  },
  { country: "PT", pattern: IBERIAN_BOX, kind: "box" },
  {
    country: "US",
    kind: "street",
    pattern:
      /\b\d+[A-Za-z]?\s+(?:[A-Z][\w'.-]*\s+){1,3}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Terrace|Circle|Cir|Parkway|Pkwy|Highway|Hwy)\b\.?/g,
  },
  { country: "US", pattern: EN_BOX, kind: "box" },
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
    const specs = ANCHORS.filter((s) => s.country === pc.country);
    const sameCountry = candidates.filter((c) => c.country === pc.country);
    let best: { start: number; end: number; match: string; gap: number; kind: "street" | "box" } | undefined;
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
          best = { start: m.index, end: Math.max(mEnd, pc.end), match: m[0], gap, kind: spec.kind };
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
        { id: best.kind === "box" ? "pattern.box" : "pattern.street", detail: best.match },
      ],
    });
  }
  return findings;
}

// One address written twice differs by punctuation, case and line breaks far
// more often than by content, and each variant would otherwise be its own row.
// Canonicalize supported postcode fragments first, then strip to letters,
// digits and single spaces; valueRaw keeps the original.
// Exported so anything comparing an address against a finding reduces both
// sides with this exact function rather than a copy that can drift from it.
export function normalizeAddress(raw: string): string {
  return canonicalizePostalCodesInAddress(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const PROFILE_HOUSE_NUMBER = String.raw`\d+\p{L}?(?:[-/]\d*\p{L}?)?`;
const PROFILE_STREET_FIRST = new RegExp(
  `^(.*\\p{L}.*?)[\\s,]+(${PROFILE_HOUSE_NUMBER})$`,
  "iu",
);
const PROFILE_HOUSE_FIRST = new RegExp(
  `^(${PROFILE_HOUSE_NUMBER})[\\s,]+(.*\\p{L}.*?)$`,
  "iu",
);

// Extract only anchors that are explicitly present in one asserted raw line.
// A longer registered postcode wins over an overlapping bare-code candidate
// (NL "1234 AB" must not also look like an ambiguous bare "1234"). Multiple
// separate postcodes or a missing street/house pair remain opaque.
export function extractKnownAddressComponents(
  raw: string,
): KnownAddressComponents | undefined {
  const candidates = findPostalCodesInAddress(raw);
  const maximal = candidates.filter((candidate) => (
    !candidates.some((other) => (
      other.start <= candidate.start
      && other.end >= candidate.end
      && (other.start < candidate.start || other.end > candidate.end)
    ))
  ));
  const groups = new Map<string, PostalCandidate[]>();
  for (const candidate of maximal) {
    const key = `${candidate.start}:${candidate.end}:${candidate.value}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  if (groups.size !== 1) return undefined;

  const candidatesAtPostcode = groups.values().next().value;
  if (!candidatesAtPostcode?.length) return undefined;
  const postcode = candidatesAtPostcode[0];
  const prefix = raw
    .slice(0, postcode.start)
    .replace(/[\s,;:–—-]+$/u, "")
    .trim();
  const streetFirst = PROFILE_STREET_FIRST.exec(prefix);
  const houseFirst = streetFirst ? undefined : PROFILE_HOUSE_FIRST.exec(prefix);
  const streetRaw = streetFirst?.[1] ?? houseFirst?.[2];
  const houseRaw = streetFirst?.[2] ?? houseFirst?.[1];
  if (!streetRaw || !houseRaw) return undefined;

  const street = normalizeAddress(streetRaw);
  const houseNumber = normalizeAddress(houseRaw);
  const postalCode = normalizeAddress(
    raw.slice(postcode.start, postcode.end),
  );
  if (!street || !houseNumber || !postalCode) return undefined;

  return {
    street,
    houseNumber,
    postalCode,
  };
}
