const DOMAIN = "paperweight.email";

export const SITE_CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  NAME: "Paperweight",
  DESCRIPTION:
    "Paperweight is a local-first desktop app that helps you understand and reduce unwanted email.",
  TAGLINE:
    "Your inbox knows where your data lives. We help you take back control.",
  DOMAIN,
  URL: `https://www.${DOMAIN}`,
  GITHUB_URL: "https://github.com/wslyvh/paperweight",
  LICENSE_URL: "https://polar.sh/pricing",

  OWNER_NAME: "westech",
  SOCIAL_TWITTER: "wslyvh",
  CONTACT_EMAIL: "hello@paperweight.email",
};
