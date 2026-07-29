// National ID registry. A country is a data + fixtures
// contribution, never an engine change. Checksum algorithms reimplemented
// from the official specs (python-stdnum is LGPL: learn, never copy).
// `requiresContext` is mandatory for formats where random digit runs can
// pass the checksum (BSN: ~10% of 9-digit numbers pass the elfproef; BE RRN
// similar). ES/IT formats carry a control letter and are distinctive enough
// on their own.
export interface NationalIdSpec {
  country: string;
  name: string;
  pattern: RegExp; // must be a /g regex over raw text
  validate(value: string): boolean;
  requiresContext?: RegExp; // tested against ±40 chars around the match
  confidence?: "verified" | "contextual"; // default verified (checksum passed)
}

export const NATIONAL_IDS: NationalIdSpec[] = [
  {
    country: "NL",
    name: "elfproef",
    pattern: /(?<!\d)\d{9}(?!\d)/g,
    validate: elfproef,
    requiresContext:
      /\b(?:bsn|burgerservicenummer|burger[-\s]?service[-\s]?nummer|sofinummer|sofi[-\s]?nummer|citizen service number)\b/i,
  },
  {
    country: "ES",
    name: "dni-mod23",
    pattern: /(?<![A-Za-z0-9])\d{8}[A-Z](?![A-Za-z0-9])/g,
    validate: (v) => dniLetter(v.slice(0, 8)) === v[8],
  },
  {
    country: "ES",
    name: "nie-mod23",
    pattern: /(?<![A-Za-z0-9])[XYZ]\d{7}[A-Z](?![A-Za-z0-9])/g,
    validate: (v) => dniLetter("XYZ".indexOf(v[0]!) + v.slice(1, 8)) === v[8],
  },
  {
    country: "IT",
    name: "codice-fiscale",
    pattern: /(?<![A-Za-z0-9])[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z](?![A-Za-z0-9])/g,
    validate: codiceFiscale,
  },
  {
    country: "BE",
    name: "rrn-mod97",
    pattern: /(?<!\d)\d{11}(?!\d)/g,
    validate: rijksregisternummer,
    requiresContext: /\b(?:rijksregisternummer|rijksregister|niss|registre national|nationaal nummer)\b/i,
  },
  {
    country: "FR",
    name: "nir-mod97",
    // 15 digits in official grouping 1-2-2-2-3-3-2, optional spaces
    pattern: /(?<!\d)[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}(?!\d)/g,
    validate: nir,
    // The mod-97 key is only two digits, so roughly one in a hundred 15-digit
    // runs passes it — and 15-digit runs are exactly what social platforms use
    // for profile and object ids. Context is what the other checksum-only
    // formats already require; this one was the last without it.
    requiresContext:
      /\b(?:num[eé]ro de s[eé]curit[eé] sociale|s[eé]curit[eé] sociale|nir|insee|carte vitale|assur[eé] social)\b/i,
  },
  {
    country: "PT",
    name: "nif-mod11",
    pattern: /(?<!\d)[1235689]\d{8}(?!\d)/g,
    validate: nif,
    requiresContext: /\b(?:nif|contribuinte|n[uú]mero de identifica[cç][aã]o fiscal)\b/i,
  },
  {
    country: "DE",
    name: "steuerid-mod11-10",
    pattern: /(?<!\d)[1-9]\d{10}(?!\d)/g,
    validate: steuerId,
    requiresContext: /\b(?:steuer[- ]?id(?:entifikationsnummer)?|steuerliche identifikationsnummer|idnr)\b/i,
  },
  {
    country: "GB",
    name: "nino-format",
    // no checksum exists; strict format + context keyword, contextual tier
    pattern: /(?<![A-Za-z0-9])[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D](?![A-Za-z0-9])/g,
    validate: (v) => !/^(?:BG|GB|NK|KN|TN|NT|ZZ)/.test(v.replace(/\s/g, "")),
    requiresContext: /\b(?:national insurance|nino|ni number)\b/i,
    confidence: "contextual",
  },
];

function elfproef(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * (digits.charCodeAt(i) - 48);
  sum -= digits.charCodeAt(8) - 48;
  return sum > 0 && sum % 11 === 0;
}

function dniLetter(digits: string): string {
  return "TRWAGMYFPDXBNJZSQVHLCKE"[Number(digits) % 23]!;
}

// control character over the first 15 chars: position-dependent value
// tables (official Agenzia delle Entrate algorithm), sum mod 26
const CF_ODD: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
function codiceFiscale(value: string): boolean {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = value[i]!;
    // 1-indexed odd positions use the table; even positions use plain values
    if (i % 2 === 0) sum += CF_ODD[ch]!;
    else sum += /\d/.test(ch) ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (sum % 26)) === value[15];
}

// checksum = 97 - (first 9 digits % 97); births from 2000 prepend "2"
function rijksregisternummer(digits: string): boolean {
  const check = Number(digits.slice(9));
  const base = Number(digits.slice(0, 9));
  return 97 - (base % 97) === check || 97 - (Number("2" + digits.slice(0, 9)) % 97) === check;
}

// key (last 2 digits) = 97 - (first 13 digits % 97), plus the embedded month.
// Months are 01-12; the official register also issues 20 (unknown month) and
// 30-42/50-99 for people naturalised or born abroad, so only the plainly
// impossible 13-19 and 43-49 are rejected.
function nir(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  const month = Number(digits.slice(3, 5));
  const monthPlausible = (month >= 1 && month <= 12) || month === 20 || (month >= 30 && month <= 42) || month >= 50;
  if (!monthPlausible) return false;
  return 97 - (Number(digits.slice(0, 13)) % 97) === Number(digits.slice(13));
}

function nif(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (digits.charCodeAt(i) - 48) * (9 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === digits.charCodeAt(8) - 48;
}

// ISO 7064 MOD 11,10 over the first 10 digits
function steuerId(digits: string): boolean {
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (digits.charCodeAt(i) - 48 + product) % 10;
    if (sum === 0) sum = 10;
    product = (2 * sum) % 11;
  }
  let check = 11 - product;
  if (check === 10) check = 0;
  return check === digits.charCodeAt(10) - 48;
}
