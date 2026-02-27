const DOMAIN = "paperweight.email";

export const SITE_CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  NAME: "Paperweight",
  DESCRIPTION:
    "Paperweight scans your inbox to map your digital footprint, then helps you take back control and delete your data. Local-first and open source.",
  TAGLINE: "Manage your digital footprint",
  DOMAIN,
  URL: `https://www.${DOMAIN}`,
  GITHUB_URL: "https://github.com/wslyvh/paperweight",
  LICENSE_URL:
    "https://buy.polar.sh/polar_cl_OJu6ndcYoHMB8L1EePkz9dlDytnsloprg8Oh14MCNqW",

  OWNER_NAME: "westech",
  SOCIAL_TWITTER: "wslyvh",
  CONTACT_EMAIL: "hello@paperweight.email",
};
