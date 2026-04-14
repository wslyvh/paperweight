/**
 * Build script: fetches GDPR enforcement fines from enforcementtracker.com and creates resources/enforcement.db
 *
 * Run manually: yarn build:enforcement
 *
 * Source: https://www.enforcementtracker.com
 * Data: 3,000+ GDPR enforcement decisions across EU/EEA/UK jurisdictions (2018–present)
 *
 * Enrichment during build:
 *   1. controller_slug  — auto-normalized from controller name (strip legal/geo suffixes, lowercase, hyphenate)
 *   2. company_slug     — matched against companies.db (exact, then longest-prefix); overrides.json takes precedence
 *   3. dpa_country      — matched against shared GDPR resolution data by country name; enables direct DPA lookup on website
 *
 * Add entries to data/enforcement/overrides.json only when auto-matching produces the wrong result.
 *
 * Uses better-sqlite3 (cross-platform, no system sqlite3 CLI needed).
 */

import Database from "better-sqlite3";
import { mkdirSync, unlinkSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { EU_DPAS, NON_EU_DPAS } from "../src/shared/gdpr/resolution.js";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");
const ET_URL = "https://www.enforcementtracker.com/data4sfk3j4hwe324kjhfdwe.json";
const OUT_PATH = join(ROOT, "resources", "enforcement.db");
const COMPANIES_DB_PATH = join(ROOT, "resources", "companies.db");
const OVERRIDES_PATH = join(ROOT, "data", "enforcement", "overrides.json");

// Raw row from enforcementtracker.com JSON (array of arrays)
// [0] empty, [1] ETid, [2] country (HTML), [3] authority, [4] date,
// [5] fine (EUR string), [6] controller (HTML), [7] sector,
// [8] articles, [9] violation_type, [10] description, [11] source (HTML), [12] url (HTML)
type EtRow = string[];

// Legal entity suffixes to strip during slug normalization
const LEGAL_SUFFIXES =
  /\b(ireland|limited|ltd\.?|inc\.?|gmbh|ag|b\.v\.?|s\.a\.u\.?|s\.p\.a\.?|s\.r\.l\.?|s\.l\.?|llc|sarl|sas|srl|spa|n\.v\.?|s\.a\.?|nv|sa|plc|se|kg|ohg|ab|as|oy|a\.s\.?|s\.r\.o\.?|d\.o\.o\.?|d\.d\.?|p\.l\.c\.?|co\.?)\b/gi;

// Geographic qualifiers common in EU entity names
const GEO_QUALIFIERS =
  /\b(españa|espagne|espana|italia|romania|germany|france|ireland|netherlands|greece|czech|poland|belgium|austria|sweden|finland|denmark|portugal|hungary|cyprus|slovakia|slovenia|croatia|bulgaria|lithuania|latvia|estonia|international|europe|european|global|worldwide)\b/gi;

// ISO 3166-1 alpha-2 country codes used as slug suffixes in companies.db
// Slugs ending in these codes are national entities (e.g., vodafone-de, sky-ie, free-fr)
// and must NOT be used for cross-country name matching — only explicit overrides
const COUNTRY_SLUG_SUFFIXES = new Set([
  "de", "fr", "gb", "uk", "ie", "es", "it", "nl", "be", "at", "ch",
  "pl", "gr", "ro", "pt", "se", "fi", "dk", "no", "is", "cz", "hu",
  "cy", "sk", "si", "hr", "bg", "lt", "lv", "ee", "lu", "mt", "li",
  "us", "ca", "au", "nz", "jp", "cn", "in", "br", "mx", "ru",
]);

function isCountrySpecificSlug(slug: string): boolean {
  const parts = slug.split("-");
  return parts.length > 1 && COUNTRY_SLUG_SUFFIXES.has(parts[parts.length - 1]);
}

// ------- Parsing helpers --------

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parseCountry(s: string): string {
  // "<img ...><br />AUSTRIA" → "Austria"
  const text = stripHtml(s);
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function parseFineEur(s: string): number | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("unknown") || lower.includes("only intention")) return null;
  // Take the last number found (handles "Multiple fines totaling EUR 178,000")
  const matches = s.replace(/,/g, "").match(/\d+/g);
  if (!matches) return null;
  return parseInt(matches[matches.length - 1], 10);
}

function parseSourceUrl(s: string): string | null {
  const match = s?.match(/href=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Normalize an enforcement controller name to a slug for matching.
 * Strips both legal suffixes AND geographic qualifiers — "Vodafone España, S.A.U." → "vodafone".
 */
function toControllerSlug(controller: string): string {
  return controller
    .replace(/\(.*?\)/g, "")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(GEO_QUALIFIERS, " ")
    .replace(/[,\.&+]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * Normalize a company name for building the name-slug index.
 * Strips only legal suffixes, NOT geographic qualifiers — "Bank of Greece" stays "bank-of-greece",
 * preventing "Bank of Ireland" (controller) from falsely matching it.
 */
function toNameSlug(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[,\.&+]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

// ------- Company slug matching against companies.db --------

function buildCompanyMatcher(companiesDbPath: string): (controllerSlug: string) => string | null {
  if (!existsSync(companiesDbPath)) {
    console.warn(`companies.db not found at ${companiesDbPath} — skipping company_slug matching`);
    return () => null;
  }

  const cdb = new Database(companiesDbPath, { readonly: true });
  const rows: { slug: string; name: string }[] = cdb.prepare("SELECT slug, name FROM companies").all() as any;
  cdb.close();

  const slugSet = new Set(rows.map((r) => r.slug));

  // Secondary index: normalized company name → company slug
  // Rules:
  //   - Skip country-specific slugs (e.g., vodafone-de, sky-ie, free-fr) — these national
  //     entities must only match via explicit overrides, never via name inference
  //   - Use toNameSlug (legal suffixes stripped, geo preserved) so "Bank of Greece" stays
  //     "bank-of-greece" and won't match a controller for "Bank of Ireland"
  //   - Skip if two companies produce the same name slug (ambiguous — could match either)
  const nameSlugToCompanySlug = new Map<string, string>();
  const ambiguousNameSlugs = new Set<string>();
  for (const { slug, name } of rows) {
    if (isCountrySpecificSlug(slug)) continue;
    const nameSlug = toNameSlug(name);
    if (!nameSlug) continue;
    if (ambiguousNameSlugs.has(nameSlug)) continue;
    if (nameSlugToCompanySlug.has(nameSlug)) {
      // Two different companies with the same normalized name — mark ambiguous, remove
      nameSlugToCompanySlug.delete(nameSlug);
      ambiguousNameSlugs.add(nameSlug);
    } else {
      nameSlugToCompanySlug.set(nameSlug, slug);
    }
  }

  // Pre-compute the long name slugs list once (used in step 4 on every call)
  const longNameSlugs = [...nameSlugToCompanySlug.keys()].filter((k) => k.length >= 8);

  function longestPrefixMatch(controllerSlug: string, keys: Iterable<string>): string | null {
    let best: string | null = null;
    for (const key of keys) {
      if (controllerSlug.startsWith(key + "-")) {
        if (!best || key.length > best.length) best = key;
      }
    }
    return best;
  }

  return function findCompanySlug(controllerSlug: string): string | null {
    // 1. Exact match against company slugs
    if (slugSet.has(controllerSlug)) return controllerSlug;

    // 2. Longest-prefix match against company slugs
    //    e.g., "meta-platforms" → "meta", "tiktok-technology" → "tiktok"
    const slugPrefix = longestPrefixMatch(controllerSlug, slugSet);
    if (slugPrefix) return slugPrefix;

    // 3. Exact match against normalized company names
    //    e.g., "piraeus-bank" exactly matches name slug → "piraeusbank"
    const nameExact = nameSlugToCompanySlug.get(controllerSlug);
    if (nameExact) return nameExact;

    // 4. Longest-prefix match against normalized company names (min 8 chars)
    //    Higher threshold than exact match: short names like "future" (6) or "orange" (6)
    //    are too generic for reliable prefix matching and cause false positives.
    //    e.g., "soundcloud-global" starts with "soundcloud-" → "soundcloud"
    const namePrefix = longestPrefixMatch(controllerSlug, longNameSlugs);
    if (namePrefix) return nameSlugToCompanySlug.get(namePrefix)!;

    return null;
  };
}

// ------- DPA country matching against shared GDPR resolution --------

function buildDpaMatcher(): (enforcementCountry: string) => string | null {
  // Build lookup: normalized country name → canonical country name from shared GDPR resolution
  const lookup = new Map<string, string>();
  for (const dpa of [...EU_DPAS, ...NON_EU_DPAS]) {
    lookup.set(dpa.country.toLowerCase(), dpa.country);
  }

  // Normalize enforcement tracker country names to match shared GDPR resolution country names
  const aliases: Record<string, string> = {
    "the netherlands": "Netherlands",
    "united kingdom": "United Kingdom",
    "czech republic": "Czech Republic",
  };

  return function getDpaCountry(enforcementCountry: string): string | null {
    const normalized = enforcementCountry.toLowerCase().trim();
    // Check alias table first, then direct lookup
    const canonical = aliases[normalized] ?? lookup.get(normalized) ?? null;
    return canonical;
  };
}

// ------- Main --------

async function main() {
  const res = await fetch(ET_URL);
  if (!res.ok) {
    console.error(`Failed to fetch enforcement data: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const json = await res.json() as { data: EtRow[] };
  const rows = json.data;
  console.log(`Loaded ${rows.length} enforcement records`);

  // Load manual overrides (etid → company_slug, or etid → null to reject a false positive)
  const overridesRaw = existsSync(OVERRIDES_PATH)
    ? JSON.parse(readFileSync(OVERRIDES_PATH, "utf-8"))
    : {};
  const overrides: Record<string, string | null> = Object.fromEntries(
    Object.entries(overridesRaw).filter(([k]) => !k.startsWith("_"))
  );
  console.log(`Loaded ${Object.keys(overrides).length} manual slug overrides`);

  const findCompanySlug = buildCompanyMatcher(COMPANIES_DB_PATH);
  const getDpaCountry = buildDpaMatcher();

  mkdirSync(join(ROOT, "resources"), { recursive: true });
  if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);

  const db = new Database(OUT_PATH);

  db.exec(`
    CREATE TABLE enforcement (
      etid TEXT PRIMARY KEY,
      country TEXT NOT NULL,
      dpa_country TEXT,
      authority TEXT,
      decision_date TEXT,
      fine_eur INTEGER,
      fine_text TEXT,
      controller TEXT,
      controller_slug TEXT,
      company_slug TEXT NOT NULL,
      match_confidence TEXT NOT NULL,
      sector TEXT,
      articles_violated TEXT,
      violation_type TEXT,
      description TEXT,
      source_url TEXT
    );
  `);

  const insert = db.prepare(`
    INSERT INTO enforcement VALUES (
      @etid, @country, @dpa_country, @authority, @decision_date,
      @fine_eur, @fine_text, @controller, @controller_slug, @company_slug,
      @match_confidence, @sector, @articles_violated, @violation_type, @description, @source_url
    )
  `);

  // Track match stats
  let matchedExact = 0;
  let matchedPrefix = 0;
  let matchedName = 0;
  let matchedOverride = 0;
  let skipped = 0;
  let dpaMatched = 0;

  const insertMany = db.transaction(() => {
    for (const row of rows) {
      const etid = stripHtml(row[1]) || null;
      const controller = stripHtml(row[6]) || null;
      const country = parseCountry(row[2]);
      const controllerSlug = controller ? toControllerSlug(controller) : null;

      // Resolve company_slug + match_confidence
      // Override value of null explicitly rejects a false positive from the auto-matcher
      let companySlug: string | null = null;
      let matchConfidence: "high" | "medium" = "high";

      if (etid && etid in overrides) {
        companySlug = overrides[etid]; // may be null (negative override)
        if (companySlug) matchedOverride++;
        else skipped++;
      } else if (controllerSlug) {
        companySlug = findCompanySlug(controllerSlug);
        if (companySlug) {
          if (controllerSlug === companySlug) {
            matchedExact++;
          } else if (controllerSlug.startsWith(companySlug + "-")) {
            matchedPrefix++;
          } else {
            matchedName++;
            matchConfidence = "medium";
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }

      // Skip unmatched records entirely — they add size without value
      if (!companySlug) continue;

      const dpaCountry = getDpaCountry(country);
      if (dpaCountry) dpaMatched++;

      insert.run({
        etid,
        country,
        dpa_country: dpaCountry,
        authority: stripHtml(row[3]) || null,
        decision_date: stripHtml(row[4]) || null,
        fine_eur: parseFineEur(row[5]),
        fine_text: stripHtml(row[5]) || null,
        controller,
        controller_slug: controllerSlug,
        company_slug: companySlug,
        match_confidence: matchConfidence,
        sector: stripHtml(row[7]) || null,
        articles_violated: stripHtml(row[8]) || null,
        violation_type: stripHtml(row[9]) || null,
        description: stripHtml(row[10]) || null,
        source_url: parseSourceUrl(row[11]),
      });
    }
  });

  insertMany();

  db.exec(`
    CREATE INDEX idx_enforcement_company_slug ON enforcement(company_slug);
    CREATE INDEX idx_enforcement_controller_slug ON enforcement(controller_slug);
    CREATE INDEX idx_enforcement_country ON enforcement(country);
    CREATE INDEX idx_enforcement_dpa ON enforcement(dpa_country) WHERE dpa_country IS NOT NULL;
    CREATE INDEX idx_enforcement_date ON enforcement(decision_date);
    VACUUM;
  `);

  db.close();

  const stored = matchedExact + matchedPrefix + matchedName + matchedOverride;
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Source records:   ${rows.length}`);
  console.log(`Stored (matched): ${stored}`);
  console.log(`  exact slug:     ${matchedExact}  (high confidence)`);
  console.log(`  prefix slug:    ${matchedPrefix}  (high confidence)`);
  console.log(`  name-based:     ${matchedName}  (medium confidence)`);
  console.log(`  override:       ${matchedOverride}  (high confidence)`);
  console.log(`Skipped:          ${skipped}`);
  console.log(`DPA enriched:     ${dpaMatched} / ${stored}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
