// The real UK postcode areas — the one or two leading letters of an outward
// code. Facts, from Royal Mail's area list, plus the Crown dependencies that
// share the system (GY, IM, JE).
//
// Why this exists: the GB postcode pattern (letters, digit, optional letter,
// space, digit, two letters) is also the shape of a great many coupon codes,
// order references and tracking ids. Checking the area against the real list is
// what separates "SW1A 1AA" from "XQ1 2AB".
const AREAS = [
  "AB", "AL", "B", "BA", "BB", "BD", "BH", "BL", "BN", "BR", "BS", "BT",
  "CA", "CB", "CF", "CH", "CM", "CO", "CR", "CT", "CV", "CW",
  "DA", "DD", "DE", "DG", "DH", "DL", "DN", "DT", "DY",
  "E", "EC", "EH", "EN", "EX",
  "FK", "FY",
  "G", "GL", "GU", "GY",
  "HA", "HD", "HG", "HP", "HR", "HS", "HU", "HX",
  "IG", "IM", "IP", "IV",
  "JE",
  "KA", "KT", "KW", "KY",
  "L", "LA", "LD", "LE", "LL", "LN", "LS", "LU",
  "M", "ME", "MK", "ML",
  "N", "NE", "NG", "NN", "NP", "NR", "NW",
  "OL", "OX",
  "PA", "PE", "PH", "PL", "PO", "PR",
  "RG", "RH", "RM",
  "S", "SA", "SE", "SG", "SK", "SL", "SM", "SN", "SO", "SP", "SR", "SS", "ST",
  "SW", "SY",
  "TA", "TD", "TF", "TN", "TQ", "TR", "TS", "TW",
  "UB",
  "W", "WA", "WC", "WD", "WF", "WN", "WR", "WS", "WV",
  "YO",
  "ZE",
];

const AREA_SET = new Set(AREAS);

// Input is the normalized "OUTWARD INWARD" form.
export function isUkPostcodeArea(normalized: string): boolean {
  const area = /^[A-Z]+/.exec(normalized.toUpperCase())?.[0];
  return area !== undefined && AREA_SET.has(area);
}
