/**
 * Generates one breach content JSON file for the website.
 *
 * Usage:
 *   yarn build:website-breach-content --slug odido
 *   yarn build:website-breach-content --slug odido --force
 *
 * Flow:
 *   1. Look up company in companies.db (required — add to data/paperweight/paperweight.json + run `yarn build:companies`)
 *   2. Look up breach in breaches.db (required — run `yarn build:breaches` first)
 *   3. Pull related breaches from breaches.db for context signals (bullet 2)
 *   4. Run Brave Search to ground nextSteps + incidentAndExposure
 *   5. Call LLM
 *   6. Write website/src/content/breaches/<slug>.json
 */

import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGroundingSources } from "./lib/brave.js";
import {
  generateBreachContentSections,
  type BreachLlmInput,
  type BreachLlmSections,
  type ContextSignal,
} from "./lib/llm.js";

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
  logoUrl?: string;
  breach: BreachRecord & { source?: { name: string; url: string } };
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
}

interface CompanyRow {
  slug: string;
  name: string;
  runs: string | null;
  categories: string | null;
  domains: string | null;
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

interface RawSignalRow {
  company: string;
  breach_date: string;
  pwn_count: number;
  attribution: string | null;
}

const COUNTRY_TLDS = new Set([
  "nl", "de", "fr", "be", "es", "it", "pl", "se", "no", "dk",
  "fi", "ie", "uk", "at", "ch", "cz", "pt", "gr", "hu", "ro",
]);

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

function parseCompanyRow(row: CompanyRow, domainFromBreach?: string): Omit<BreachRecord, keyof RawBreachRow | "data_classes" | "is_verified" | "is_sensitive" | "attribution" | "disclosure_url" | "logo_path"> {
  return {
    slug: row.slug,
    company_name: row.name,
    runs: row.runs ? (JSON.parse(row.runs) as string[]) : [],
    categories: row.categories ? (JSON.parse(row.categories) as string[]) : [],
    address: row.address ?? undefined,
    web: row.web ?? undefined,
    webform: row.webform ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    suggested_transport_medium: row.suggested_transport_medium ?? undefined,
    // Fields from BreachRecord that only the breach row provides — filled in by caller.
    name: "",
    title: "",
    domain: domainFromBreach ?? "",
    breach_date: "",
    added_date: "",
    modified_date: "",
    pwn_count: 0,
    description: "",
  };
}

function primaryDomain(row: CompanyRow): string | undefined {
  if (!row.domains) return undefined;
  const first = row.domains.split(",")[0]?.trim();
  return first || undefined;
}

function countryTld(domain: string): string | undefined {
  const parts = domain.split(".");
  const last = parts[parts.length - 1]?.toLowerCase();
  return last && COUNTRY_TLDS.has(last) ? last : undefined;
}

function fetchContextSignals(
  breachesDb: Database.Database,
  currentSlug: string,
  currentDomain: string,
  attribution: string | undefined,
  categories: string[],
): ContextSignal[] {
  const signals: ContextSignal[] = [];
  const since12m = "date('now', '-12 months')";
  const since6m = "date('now', '-6 months')";

  const baseSelect = `
    SELECT c.name AS company, b.breach_date, b.pwn_count, b.attribution
    FROM breaches b
    JOIN companies.companies c ON (',' || c.domains || ',' LIKE '%,' || b.domain || ',%')
    WHERE c.slug != ?
  `;

  if (attribution) {
    const rows = breachesDb
      .prepare(`${baseSelect} AND b.attribution = ? AND b.breach_date >= ${since12m} ORDER BY b.breach_date DESC LIMIT 3`)
      .all(currentSlug, attribution) as RawSignalRow[];
    for (const r of rows) {
      signals.push({
        type: "same-attribution",
        company: r.company,
        breach_date: r.breach_date,
        pwn_count: r.pwn_count,
        attribution: r.attribution ?? undefined,
      });
    }
  }

  const tld = countryTld(currentDomain);
  if (tld) {
    const rows = breachesDb
      .prepare(`${baseSelect} AND b.domain LIKE ? AND b.breach_date >= ${since6m} ORDER BY b.breach_date DESC LIMIT 3`)
      .all(currentSlug, `%.${tld}`) as RawSignalRow[];
    for (const r of rows) {
      signals.push({
        type: "same-country",
        company: r.company,
        breach_date: r.breach_date,
        pwn_count: r.pwn_count,
        attribution: r.attribution ?? undefined,
      });
    }
  }

  for (const cat of categories) {
    const rows = breachesDb
      .prepare(`${baseSelect} AND c.categories LIKE ? AND b.breach_date >= ${since12m} ORDER BY b.breach_date DESC LIMIT 3`)
      .all(currentSlug, `%"${cat}"%`) as RawSignalRow[];
    for (const r of rows) {
      signals.push({
        type: "same-sector",
        company: r.company,
        breach_date: r.breach_date,
        pwn_count: r.pwn_count,
        attribution: r.attribution ?? undefined,
      });
    }
  }

  // Dedupe by company+type so we don't repeat a single related breach under multiple categories.
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.type}|${s.company}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  // --- Company (required) ---
  const companiesDb = new Database(COMPANIES_DB_PATH, { readonly: true });
  const companyRow = companiesDb
    .prepare(
      `SELECT slug, name, runs, categories, domains, address, web, webform, email, phone, suggested_transport_medium
       FROM companies WHERE slug = ?`,
    )
    .get(slug) as CompanyRow | undefined;

  if (!companyRow) {
    companiesDb.close();
    throw new Error(
      `No company found for slug "${slug}" in companies.db. Add it to data/paperweight/paperweight.json and re-run \`yarn build:companies\`.`,
    );
  }
  const companyPrimaryDomain = primaryDomain(companyRow);
  companiesDb.close();

  // --- Breach (prefer local DB, fall back to HIBP) ---
  const breachesDb = new Database(BREACHES_DB_PATH, { readonly: true });
  breachesDb.exec(`ATTACH DATABASE '${COMPANIES_DB_PATH}' AS companies`);

  const breachSql = `
    SELECT
      b.name, b.title, b.domain, b.breach_date, b.added_date, b.modified_date, b.pwn_count,
      b.description, b.attribution, b.disclosure_url, b.data_classes, b.is_verified,
      b.is_sensitive, b.logo_path
    FROM breaches b
    JOIN companies.companies c ON (',' || c.domains || ',' LIKE '%,' || b.domain || ',%')
    WHERE c.slug = ?
      AND b.domain IS NOT NULL
      AND b.domain != ''
    ORDER BY b.pwn_count DESC
    LIMIT 1
  `;
  const breachRow = breachesDb.prepare(breachSql).get(slug) as RawBreachRow | undefined;

  let breachFields: {
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
  };

  if (breachRow) {
    console.info(`[breach] loaded from breaches.db`);
    breachFields = {
      name: breachRow.name,
      title: breachRow.title,
      domain: breachRow.domain,
      breach_date: breachRow.breach_date,
      added_date: breachRow.added_date,
      modified_date: breachRow.modified_date,
      pwn_count: breachRow.pwn_count,
      description: breachRow.description,
      attribution: breachRow.attribution ?? undefined,
      disclosure_url: breachRow.disclosure_url ?? undefined,
      logo_path: breachRow.logo_path ?? undefined,
      data_classes: JSON.parse(breachRow.data_classes ?? "[]") as string[],
      is_verified: breachRow.is_verified === 1,
      is_sensitive: breachRow.is_sensitive === 1,
    };
  } else if (existsSync(outputPath)) {
    console.info(`[breach] not in breaches.db; loading from existing ${slug}.json`);
    const existing = JSON.parse(readFileSync(outputPath, "utf-8")) as { breach: BreachRecord };
    const b = existing.breach;
    breachFields = {
      name: b.name,
      title: b.title,
      domain: b.domain,
      breach_date: b.breach_date,
      added_date: b.added_date,
      modified_date: b.modified_date,
      pwn_count: b.pwn_count,
      description: b.description,
      attribution: b.attribution,
      disclosure_url: b.disclosure_url,
      logo_path: b.logo_path,
      data_classes: b.data_classes,
      is_verified: b.is_verified,
      is_sensitive: b.is_sensitive,
    };
  } else {
    breachesDb.close();
    throw new Error(
      `No breach record found for slug "${slug}". Run \`yarn build:breaches\` to refresh from HIBP. If the breach isn't on HIBP, hand-write ${outputPath} first (see tasks/breach-content.md) and re-run with --force to regenerate only the content section.`,
    );
  }

  // --- Context signals from local breaches.db ---
  const signals = fetchContextSignals(
    breachesDb,
    slug,
    breachFields.domain,
    breachFields.attribution,
    companyRow.categories ? (JSON.parse(companyRow.categories) as string[]) : [],
  );
  breachesDb.close();
  console.info(`[signals] ${signals.length} related breach(es) found`);

  // --- Enforcement ---
  const enforcementDb = new Database(ENFORCEMENT_DB_PATH, { readonly: true });
  const enforcementRows = enforcementDb
    .prepare(
      `SELECT etid, controller, fine_eur, decision_date, authority,
              dpa_country, articles_violated, violation_type, description, source_url, company_slug
       FROM enforcement WHERE company_slug = ? ORDER BY decision_date DESC`,
    )
    .all(slug) as RawEnforcementRow[];
  enforcementDb.close();
  const enforcement = enforcementRows.map(parseEnforcementRow);

  // --- Grounding sources from Brave + optional company page fetch ---
  const sources = await buildGroundingSources({
    companyName: companyRow.name,
    primaryDomain: companyPrimaryDomain,
    breachDate: breachFields.breach_date,
    addedDate: breachFields.added_date,
    disclosureUrl: breachFields.disclosure_url,
  });
  console.info(`[sources] ${sources.length} Brave result(s), ${sources.filter((s) => s.content).length} full-fetched`);

  // --- LLM ---
  const llmInput: BreachLlmInput = {
    company_name: companyRow.name,
    domain: breachFields.domain,
    breach_date: breachFields.breach_date,
    added_date: breachFields.added_date,
    pwn_count: breachFields.pwn_count,
    data_classes: breachFields.data_classes,
    is_verified: breachFields.is_verified,
    description: breachFields.description,
    attribution: breachFields.attribution,
  };
  const content = await generateBreachContentSections(
    llmInput,
    enforcement.map((e) => ({
      fine_eur: e.fine_eur,
      authority: e.authority,
      decision_date: e.decision_date,
      violation_type: e.violation_type,
      articles_violated: e.articles_violated,
    })),
    signals,
    sources,
  );

  // --- Assemble + write ---
  const companyFields = parseCompanyRow(companyRow, breachFields.domain);
  const fullBreach: BreachRecord = {
    ...companyFields,
    ...breachFields,
  };
  const totalFines = enforcement.reduce((sum, row) => sum + row.fine_eur, 0);

  // Preserve manually-authored fields (logoUrl, breach.source) when regenerating.
  let preservedLogoUrl: string | undefined;
  let preservedSource: { name: string; url: string } | undefined;
  if (existsSync(outputPath)) {
    const prev = JSON.parse(readFileSync(outputPath, "utf-8")) as {
      logoUrl?: string;
      breach?: { source?: { name: string; url: string } };
    };
    preservedLogoUrl = prev.logoUrl;
    preservedSource = prev.breach?.source;
  }

  const payload: BreachDataSnapshot = {
    slug,
    generated_at: new Date().toISOString(),
    ...(preservedLogoUrl ? { logoUrl: preservedLogoUrl } : {}),
    breach: preservedSource ? { ...fullBreach, source: preservedSource } : fullBreach,
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
