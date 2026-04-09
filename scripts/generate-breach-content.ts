/**
 * Generates one breach content JSON file for the website.
 *
 * Usage:
 *   yarn build:website-breach-content --slug odido
 *   yarn build:website-breach-content --slug odido --force
 *
 * Output: website/src/content/breaches/<slug>.json
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBreachContentSections, type BreachLlmSections } from "./lib/llm.js";

interface BreachRecord {
  name: string;
  title: string;
  domain: string;
  breach_date: string;
  added_date: string;
  modified_date: string;
  pwn_count: number;
  description: string;
  attribution?: string;
  disclosure_url?: string;
  logo_path?: string;
  data_classes: string[];
  is_verified: boolean;
  is_sensitive: boolean;
  slug: string;
  company_name: string;
  runs: string[];
  categories: string[];
  address?: string;
  web?: string;
  webform?: string;
  email?: string;
  phone?: string;
  suggested_transport_medium?: string;
}

interface EnforcementRecord {
  etid: string;
  controller: string;
  fine_eur: number;
  decision_date: string;
  authority: string;
  dpa_country?: string;
  articles_violated?: string;
  violation_type?: string;
  description?: string;
  source_url?: string;
  company_slug: string;
}

interface BreachDataSnapshot {
  slug: string;
  generated_at: string;
  breach: BreachRecord;
  enforcement: {
    records: EnforcementRecord[];
    total_fines: number;
  };
  content: BreachLlmSections;
}

interface RawBreachRow {
  name: string;
  title: string;
  domain: string;
  breach_date: string;
  added_date: string;
  modified_date: string;
  pwn_count: number;
  description: string;
  attribution: string | null;
  disclosure_url: string | null;
  logo_path: string | null;
  data_classes: string;
  is_verified: number;
  is_sensitive: number;
  slug: string;
  company_name: string;
  runs: string | null;
  categories: string;
  address: string | null;
  web: string | null;
  webform: string | null;
  email: string | null;
  phone: string | null;
  suggested_transport_medium: string | null;
}

interface RawEnforcementRow {
  etid: string;
  controller: string;
  fine_eur: number | null;
  decision_date: string;
  authority: string;
  dpa_country: string | null;
  articles_violated: string | null;
  violation_type: string | null;
  description: string | null;
  source_url: string | null;
  company_slug: string;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEBSITE_ROOT = join(ROOT, "website");
const OUTPUT_DIR = join(WEBSITE_ROOT, "src", "content", "breaches");
const BREACHES_DB_PATH = join(ROOT, "resources", "breaches.db");
const COMPANIES_DB_PATH = join(ROOT, "resources", "companies.db");
const ENFORCEMENT_DB_PATH = join(ROOT, "resources", "enforcement.db");
const args = process.argv.slice(2);
const slugIdx = args.indexOf("--slug");
const force = args.includes("--force");

if (slugIdx === -1 || !args[slugIdx + 1]) {
  console.error("Usage: yarn build:website-breach-content --slug <slug> [--force]");
  process.exit(1);
}

const slug = args[slugIdx + 1];
const outputPath = join(OUTPUT_DIR, `${slug}.json`);

function parseBreachRow(row: RawBreachRow): BreachRecord {
  return {
    ...row,
    attribution: row.attribution ?? undefined,
    disclosure_url: row.disclosure_url ?? undefined,
    logo_path: row.logo_path ?? undefined,
    data_classes: JSON.parse(row.data_classes ?? "[]"),
    is_verified: row.is_verified === 1,
    is_sensitive: row.is_sensitive === 1,
    runs: JSON.parse(row.runs ?? "[]"),
    categories: JSON.parse(row.categories ?? "[]"),
    address: row.address ?? undefined,
    web: row.web ?? undefined,
    webform: row.webform ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    suggested_transport_medium: row.suggested_transport_medium ?? undefined,
  };
}

function parseEnforcementRow(row: RawEnforcementRow): EnforcementRecord {
  return {
    etid: row.etid,
    controller: row.controller,
    fine_eur: row.fine_eur ?? 0,
    decision_date: row.decision_date,
    authority: row.authority,
    dpa_country: row.dpa_country ?? undefined,
    articles_violated: row.articles_violated ?? undefined,
    violation_type: row.violation_type ?? undefined,
    description: row.description ?? undefined,
    source_url: row.source_url ?? undefined,
    company_slug: row.company_slug,
  };
}

async function main(): Promise<void> {
  if (existsSync(outputPath) && !force) {
    console.info(`[skip] ${slug}.json already exists. Pass --force to regenerate.`);
    return;
  }

  const breachesDb = new Database(BREACHES_DB_PATH, { readonly: true });
  breachesDb.exec(`ATTACH DATABASE '${COMPANIES_DB_PATH}' AS companies`);

  const breachSql = `
    SELECT
      b.name, b.title, b.domain, b.breach_date, b.added_date, b.modified_date, b.pwn_count,
      b.description, b.attribution, b.disclosure_url, b.data_classes, b.is_verified,
      b.is_sensitive, b.logo_path,
      c.slug, c.name AS company_name, c.runs, c.categories,
      c.address, c.web, c.webform, c.email, c.phone, c.suggested_transport_medium
    FROM breaches b
    JOIN companies.companies c ON (',' || c.domains || ',' LIKE '%,' || b.domain || ',%')
    WHERE c.slug = ?
      AND b.domain IS NOT NULL
      AND b.domain != ''
    ORDER BY b.pwn_count DESC
    LIMIT 1
  `;

  const breachRow = breachesDb.prepare(breachSql).get(slug) as RawBreachRow | undefined;
  breachesDb.close();
  if (!breachRow) {
    throw new Error(`No breach record found for slug "${slug}"`);
  }
  const breach = parseBreachRow(breachRow);

  const enforcementDb = new Database(ENFORCEMENT_DB_PATH, { readonly: true });
  const enforcementSql = `
    SELECT
      etid, controller, fine_eur, decision_date, authority,
      dpa_country, articles_violated, violation_type, description, source_url, company_slug
    FROM enforcement
    WHERE company_slug = ?
    ORDER BY decision_date DESC
  `;
  const enforcementRows = enforcementDb
    .prepare(enforcementSql)
    .all(slug) as RawEnforcementRow[];
  enforcementDb.close();
  const enforcement = enforcementRows.map(parseEnforcementRow);

  const content = await generateBreachContentSections(breach, enforcement);
  const totalFines = enforcement.reduce((sum, row) => sum + row.fine_eur, 0);

  const payload: BreachDataSnapshot = {
    slug,
    generated_at: new Date().toISOString(),
    breach,
    enforcement: {
      records: enforcement,
      total_fines: totalFines,
    },
    content,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  console.info(`Wrote ${outputPath}`);
  console.info(`Slug: ${slug}`);
  console.info(`Enforcement rows: ${enforcement.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
