const DOMAIN = "paperweight.email";

export const SITE_CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  ICON: "🗿",
  NAME: "Paperweight",
  DESCRIPTION:
    "Paperweight scans your inbox to map your digital footprint, then helps you take back control and delete your data. Local-first and open source.",
  TAGLINE: "Manage your digital footprint",
  DOMAIN,
  URL: `https://www.${DOMAIN}`,
  GITHUB_URL: "https://github.com/wslyvh/paperweight",
  LICENSE_URL:
    "https://buy.polar.sh/polar_cl_OJu6ndcYoHMB8L1EePkz9dlDytnsloprg8Oh14MCNqW",

  PRODUCT_HUNT_URL: "https://www.producthunt.com/products/paperweight",
  ALTERNATIVETO_URL:
    "https://alternativeto.net/software/paperweight-email/",
  PRIVACY_GUIDES_URL:
    "https://discuss.privacyguides.net/t/paperweight-local-first-open-source-desktop-app-to-cleanup-email-and-manage-your-digital-footprint/37164",
  TWITTER_URL: "https://x.com/wslyvh",

  OWNER_NAME: "westech",
  SOCIAL_TWITTER: "wslyvh",
  CONTACT_EMAIL: "hello@paperweight.email",
} as const;

export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_CONFIG.NAME,
  url: SITE_CONFIG.URL,
  logo: `${SITE_CONFIG.URL}/icon.png`,
  description: SITE_CONFIG.DESCRIPTION,
  email: SITE_CONFIG.CONTACT_EMAIL,
  sameAs: [
    SITE_CONFIG.GITHUB_URL,
    SITE_CONFIG.PRODUCT_HUNT_URL,
    SITE_CONFIG.ALTERNATIVETO_URL,
    SITE_CONFIG.TWITTER_URL,
    SITE_CONFIG.PRIVACY_GUIDES_URL,
  ],
};
