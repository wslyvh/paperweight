// Card scheme IIN prefixes and valid lengths (facts; Braintree
// card-validator's ranges used as reference). Order matters: schemes are
// checked top-down and the first prefix match wins, so narrow ranges
// (visa/mastercard/amex) come before maestro's broad 50/56-69/6x range.
export interface CardScheme {
  name: string;
  prefix: RegExp;
  lengths: number[];
}

export const CARD_SCHEMES: CardScheme[] = [
  { name: "visa", prefix: /^4/, lengths: [13, 16, 19] },
  { name: "mastercard", prefix: /^(?:5[1-5]|2(?:22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720))/, lengths: [16] },
  { name: "amex", prefix: /^3[47]/, lengths: [15] },
  { name: "maestro", prefix: /^(?:50|5[6-9]|6\d)/, lengths: [12, 13, 14, 15, 16, 17, 18, 19] },
];
