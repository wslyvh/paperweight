// Map datenanfragen source categories → Paperweight vendor categories.
/** @type {Record<string, string>} */
const CATEGORY_MAP = {
  finance: "financial",
  insurance: "financial",
  "credit agency": "financial",
  "collection agency": "financial",
  health: "healthcare",
  "public body": "government",
  school: "government",
  ads: "marketing",
  addresses: "marketing",
  "social media": "social",
  telecommunication: "communication",
  commerce: "shopping",
  travel: "shopping",
  entertainment: "entertainment",
  utility: "services",
  church: "services",
  nonprofit: "services",
  "political party": "services",
  // Pass-throughs: paperweight source files use app-category names directly
  financial: "financial",
  healthcare: "healthcare",
  government: "government",
  marketing: "marketing",
  social: "social",
  communication: "communication",
  shopping: "shopping",
  services: "services",
};

/** @param {string[]} [sourceCategories] */
export function mapCategories(sourceCategories) {
  if (!sourceCategories) return [];
  const mapped = new Set();
  for (const src of sourceCategories) {
    const app = CATEGORY_MAP[src];
    if (app) mapped.add(app);
  }
  return [...mapped];
}

/** @param {{ web?: string, webform?: string, email?: string }} company */
export function extractDomains(company) {
  const domains = new Set();
  for (const url of [company.web, company.webform]) {
    if (!url) continue;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      domains.add(hostname);
    } catch {
      // skip invalid URLs
    }
  }

  // Extract domain from email (e.g. privacy@google.com → google.com)
  if (company.email) {
    const emailDomain = company.email.split("@")[1];
    if (emailDomain) domains.add(emailDomain);
  }

  return [...domains];
}
