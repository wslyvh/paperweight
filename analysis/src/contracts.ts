// Dependency-free vocabulary shared by the engine and its consumers.
// Product labels and risk policy stay with each application.

export const MESSAGE_TYPES = [
  "personal",
  "purchase",
  "update",
  "promotion",
  "social",
  "unknown",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

// Candidate list relationships. `promotion` always carries a resolved
// unsubscribe action. `social` may not, so consumers building an action surface
// must additionally require Analysis.unsubscribe.
export const LIST_MESSAGE_TYPES: readonly MessageType[] = [
  "promotion",
  "social",
];

export const ACCOUNT_MESSAGE_TYPES: readonly MessageType[] = [
  "purchase",
  "update",
  "social",
];

export const FINDING_TYPES = [
  "email",
  "iban",
  "credit_card",
  "national_id",
  "phone",
  "postal_code",
  "address",
  "date_of_birth",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

// Intrinsic data sensitivity only. An application may add vendor, breach or
// workflow context when it calculates product risk.
export const FINDING_SENSITIVITY_ORDER: readonly FindingType[] = [
  "credit_card",
  "iban",
  "national_id",
  "phone",
  "address",
  "postal_code",
  "email",
  "date_of_birth",
];

// Public webmail and ISP domains. Mail from one of these is a person writing,
// not a company — the same judgement whether the caller is classifying a
// message type or deciding a sender is not a vendor at all, so it lives here
// rather than in either codebase's own copy.
//
// A missing entry is a safe miss (the sender is treated as a company); a wrong
// entry silently drops a real vendor, so additions want to be real webmail.
export const PERSONAL_DOMAINS: string[] = [
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.de",
  "hotmail.fr",
  "hotmail.nl",
  "live.com",
  "live.co.uk",
  "live.be",
  "live.de",
  "live.fr",
  "live.nl",
  "msn.com",
  // Yahoo
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.de",
  "yahoo.fr",
  "ymail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Proton
  "protonmail.com",
  "proton.me",
  "pm.me",
  // Privacy / independent
  "fastmail.com",
  "tutanota.com",
  "tuta.com",
  // AOL
  "aol.com",
  // German providers
  "gmx.de",
  "gmx.net",
  "gmx.com",
  "web.de",
  "t-online.de",
  // French providers
  "laposte.net",
  "orange.fr",
  "wanadoo.fr",
  // UK providers
  "btinternet.com",
  // Italian providers
  "libero.it",
  // Dutch ISPs
  "hetnet.nl",
  "planet.nl",
  "kpnmail.nl",
  "xs4all.nl",
  "ziggo.nl",
  "upcmail.nl",
  "casema.nl",
  "home.nl",
];
