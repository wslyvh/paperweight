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

  PERSONAL_DOMAINS: [
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "yahoo.co.uk",
    "aol.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "protonmail.com",
    "proton.me",
    "pm.me",
  ],
};
