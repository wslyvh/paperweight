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
  GITHUB_REPO: "wslyvh/paperweight",

  PERSONAL_DOMAINS: [
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
  ],
};
