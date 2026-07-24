export const APP_CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  NAME: "Paperweight",
  DESCRIPTION:
    "Paperweight is a local-first desktop app that helps you understand and reduce unwanted email.",
  TAGLINE: "Take control of your inbox.",
  DOMAIN: "paperweight.email",
  WEBSITE: `https://www.paperweight.email`,

  OWNER_NAME: "Paperweight",
  SOCIAL_TWITTER: "wslyvh",
  CONTACT_EMAIL: "hello@paperweight.email",

  LICENSE_API_URL: "https://www.paperweight.email/api/license",
};

// Public webmail and ISP domains live in @paperweight/analysis — the engine
// needs the same list to tell a person's mail from a company's, and two copies
// would drift. Main-process consumers import PERSONAL_DOMAINS from the engine
// directly; it is not re-exported here because this module is also bundled into
// the renderer, which only ever sees the engine's dependency-free contracts.

// The production walk measured 11,890 stored bodies: 99.7% were at or below
// 50 KB, with only 34 above it. Cap before analysis so persisted text and
// finding offsets remain the same contract.
export const BODY_TEXT_MAX_LENGTH = 50 * 1024;
