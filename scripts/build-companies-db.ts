/**
 * Build script: reads /companies/*.json and creates resources/companies.db
 *
 * Run manually: yarn build:companies
 *
 * Uses better-sqlite3 (cross-platform, no system sqlite3 CLI needed).
 */

import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");
const COMPANIES_DIR = join(ROOT, "data", "datenanfragen");
const PAPERWEIGHT_NL_PATH = join(ROOT, "data", "paperweight", "nl.json");
const OUT_PATH = join(ROOT, "resources", "companies.db");
const WEBSITE_OUT_DIR = join(ROOT, "website", "src", "data");
const WEBSITE_OUT_PATH = join(WEBSITE_OUT_DIR, "companies.generated.json");

interface CompanyJson {
  slug: string;
  name: string;
  runs?: string[];
  categories?: string[];
  address?: string;
  web?: string;
  webform?: string;
  email?: string;
  phone?: string;
  quality?: string;
  comments?: string[];
  "suggested-transport-medium"?: string;
  "relevant-countries"?: string[];
}

interface WebsiteCompany
  extends Omit<
    CompanyJson,
    "categories" | "suggested-transport-medium" | "relevant-countries"
  > {
  categories?: string[];
  domains: string[];
  suggestedTransportMedium?: string;
}

// Map datenanfragen source categories → app categories (from RISK_CATEGORIES in languages.ts)
const CATEGORY_MAP: Record<string, string> = {
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
  entertainment: "entertainment",
  services: "services",
};

function mapCategories(sourceCategories?: string[]): string[] {
  if (!sourceCategories) return [];
  const mapped = new Set<string>();
  for (const src of sourceCategories) {
    const app = CATEGORY_MAP[src];
    if (app) mapped.add(app);
  }
  return [...mapped];
}

function escSql(str: string | null | undefined): string {
  if (str == null) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function extractDomains(company: CompanyJson): string[] {
  const domains = new Set<string>();
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

function toWebsiteCompany(company: CompanyJson): WebsiteCompany {
  const mappedCategories = mapCategories(company.categories);
  const domains = extractDomains(company);
  return {
    slug: company.slug,
    name: company.name,
    runs: company.runs,
    categories: mappedCategories.length > 0 ? mappedCategories : undefined,
    domains,
    address: company.address,
    web: company.web,
    webform: company.webform,
    email: company.email,
    phone: company.phone,
    quality: company.quality,
    comments: company.comments,
    suggestedTransportMedium: company["suggested-transport-medium"],
  };
}

function main() {
  mkdirSync(join(ROOT, "resources"), { recursive: true });
  mkdirSync(WEBSITE_OUT_DIR, { recursive: true });

  // Start fresh
  if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);

  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} company files`);

  // Build SQL
  const sqlParts: string[] = [
    `CREATE TABLE companies (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      runs TEXT,
      categories TEXT,
      domains TEXT,
      address TEXT,
      web TEXT,
      webform TEXT,
      email TEXT,
      phone TEXT,
      quality TEXT,
      comments TEXT,
      suggested_transport_medium TEXT
    );`,
    "BEGIN TRANSACTION;",
  ];

  const qualityCounts: Record<string, number> = {};
  let withDomains = 0;
  let imported = 0;
  const websiteCompanies = new Map<string, WebsiteCompany>();

  for (const file of files) {
    try {
      const raw = readFileSync(join(COMPANIES_DIR, file), "utf-8");
      const c: CompanyJson = JSON.parse(raw);
      const domains = extractDomains(c);

      const categories = mapCategories(c.categories);
      websiteCompanies.set(c.slug, toWebsiteCompany(c));

      const values = [
        escSql(c.slug),
        escSql(c.name),
        c.runs ? escSql(JSON.stringify(c.runs)) : "NULL",
        categories.length > 0 ? escSql(JSON.stringify(categories)) : "NULL",
        domains.length > 0 ? escSql(domains.join(",")) : "NULL",
        escSql(c.address ?? null),
        escSql(c.web ?? null),
        escSql(c.webform ?? null),
        escSql(c.email ?? null),
        escSql(c.phone ?? null),
        escSql(c.quality ?? null),
        c.comments ? escSql(JSON.stringify(c.comments)) : "NULL",
        escSql(c["suggested-transport-medium"] ?? null),
      ].join(",");

      sqlParts.push(`INSERT OR IGNORE INTO companies VALUES (${values});`);

      imported++;
      if (domains.length > 0) withDomains++;
      const q = c.quality ?? "unknown";
      qualityCounts[q] = (qualityCounts[q] || 0) + 1;
    } catch (err) {
      console.error(`Failed to process ${file}:`, err);
    }
  }

  // --- Paperweight curated companies (override datenanfragen on slug conflict) ---
  let paperweightImported = 0;
  if (existsSync(PAPERWEIGHT_NL_PATH)) {
    const nlCompanies: CompanyJson[] = JSON.parse(readFileSync(PAPERWEIGHT_NL_PATH, "utf-8"));
    console.log(`Found ${nlCompanies.length} paperweight/nl companies`);
    for (const c of nlCompanies) {
      try {
        const domains = extractDomains(c);
        const categories = mapCategories(c.categories);
        websiteCompanies.set(c.slug, toWebsiteCompany(c));
        const values = [
          escSql(c.slug),
          escSql(c.name),
          c.runs ? escSql(JSON.stringify(c.runs)) : "NULL",
          categories.length > 0 ? escSql(JSON.stringify(categories)) : "NULL",
          domains.length > 0 ? escSql(domains.join(",")) : "NULL",
          escSql(c.address ?? null),
          escSql(c.web ?? null),
          escSql(c.webform ?? null),
          escSql(c.email ?? null),
          escSql(c.phone ?? null),
          escSql(c.quality ?? null),
          c.comments ? escSql(JSON.stringify(c.comments)) : "NULL",
          escSql(c["suggested-transport-medium"] ?? null),
        ].join(",");
        sqlParts.push(`INSERT OR REPLACE INTO companies VALUES (${values});`);
        paperweightImported++;
      } catch (err) {
        console.error(`Failed to process paperweight entry ${c.slug}:`, err);
      }
    }
  }

  sqlParts.push("COMMIT;");
  sqlParts.push("CREATE INDEX idx_companies_domains ON companies(domains);");
  sqlParts.push("CREATE INDEX idx_companies_name ON companies(name);");
  sqlParts.push("VACUUM;");

  const sql = sqlParts.join("\n");
  const db = new Database(OUT_PATH);
  db.exec(sql);
  db.close();

  const websiteList = [...websiteCompanies.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  writeFileSync(WEBSITE_OUT_PATH, `${JSON.stringify(websiteList)}\n`, "utf-8");

  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Wrote ${WEBSITE_OUT_PATH}`);
  console.log(`datenanfragen: ${imported} companies`);
  console.log(`paperweight/nl: ${paperweightImported} companies`);
  console.log(`With domains: ${withDomains + paperweightImported}`);
  console.log("Quality:", qualityCounts);
}

main();
