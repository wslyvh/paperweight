import { isUkPostcodeArea } from "./uk-postcode-areas";

// Postcode registry. Pattern facts from Google's
// libaddressinput dataset. Coverage follows the wave-1 language matrix
// (one country set per lexicon language): every lexicon language's countries are present. Two tiers:
// - standalone: structurally distinctive, emitted as a finding on their own
// - anchor-only: bare digit codes that would false-positive on any invoice
//   number; they only ever qualify an address block (and only when a city
//   token follows), never surface alone
export interface PostalSpec {
  country: string;
  pattern: RegExp; // /g, uppercase-only on purpose: lowercase kills precision
  tier: "standalone" | "anchor-only";
  // The canonical form contains one space that valid raw text may omit.
  // Currently true only for NL and GB.
  optionalInternalSpace?: boolean;
  // Optional second gate on the normalized value, where the pattern alone is
  // too generous to be a fact (GB: the outward area must be a real one).
  validate?: (normalized: string) => boolean;
}

const US_STATE =
  "A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]";

// shared /g patterns are safe: String.matchAll clones the regex
const BARE_5 = /(?<![\d-])\d{5}(?![\dA-Za-z-])/g; // DE PLZ, FR/ES/IT CP
const BARE_4 = /(?<![\d-])[1-9]\d{3}(?![\dA-Za-z-])/g; // BE, AT

export const POSTAL_CODES: PostalSpec[] = [
  // SA/SD/SS are never issued (official rule)
  {
    country: "NL",
    pattern: /(?<![A-Z0-9])[1-9]\d{3} ?(?!SA|SD|SS)[A-Z]{2}(?![A-Z0-9])/g,
    tier: "standalone",
    optionalInternalSpace: true,
  },
  {
    country: "GB",
    pattern: /(?<![A-Z0-9])[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}(?![A-Z0-9])/g,
    tier: "standalone",
    optionalInternalSpace: true,
    validate: isUkPostcodeArea,
  },
  { country: "PT", pattern: /(?<![\d-])\d{4}-\d{3}(?![\d-])/g, tier: "standalone" },
  // the state+ZIP pair is distinctive; a bare ZIP is not
  {
    country: "US",
    pattern: new RegExp(`(?<![A-Z0-9])(?:${US_STATE}) \\d{5}(?:-\\d{4})?(?![A-Za-z0-9-])`, "g"),
    tier: "standalone",
  },
  { country: "US", pattern: /(?<![\d-])\d{5}(?:-\d{4})?(?![\dA-Za-z-])/g, tier: "anchor-only" },
  { country: "DE", pattern: BARE_5, tier: "anchor-only" },
  { country: "FR", pattern: BARE_5, tier: "anchor-only" },
  { country: "ES", pattern: BARE_5, tier: "anchor-only" },
  { country: "IT", pattern: BARE_5, tier: "anchor-only" },
  { country: "BE", pattern: BARE_4, tier: "anchor-only" },
  { country: "AT", pattern: BARE_4, tier: "anchor-only" },
];
