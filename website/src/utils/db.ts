import Database from "better-sqlite3";
import { join } from "path";

const RESOURCES_DIR = join(process.cwd(), "..", "resources");

function openDb(filename: string): Database.Database {
  return new Database(join(RESOURCES_DIR, filename), { readonly: true });
}

export interface BreachRecord {
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

export interface EnforcementRecord {
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
}

type RawBreachRow = Omit<
  BreachRecord,
  "data_classes" | "categories" | "runs" | "is_verified" | "is_sensitive" | "attribution" | "disclosure_url" | "logo_path" | "address" | "web" | "webform" | "email" | "phone" | "suggested_transport_medium"
> & {
  attribution: string | null;
  disclosure_url: string | null;
  logo_path: string | null;
  data_classes: string;
  categories: string;
  runs: string | null;
  is_verified: number;
  is_sensitive: number;
  address: string | null;
  web: string | null;
  webform: string | null;
  email: string | null;
  phone: string | null;
  suggested_transport_medium: string | null;
};

function parseBreachRow(row: RawBreachRow): BreachRecord {
  return {
    ...row,
    attribution: row.attribution ?? undefined,
    disclosure_url: row.disclosure_url ?? undefined,
    logo_path: row.logo_path ?? undefined,
    address: row.address ?? undefined,
    web: row.web ?? undefined,
    webform: row.webform ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    suggested_transport_medium: row.suggested_transport_medium ?? undefined,
    data_classes: JSON.parse(row.data_classes ?? "[]"),
    categories: JSON.parse(row.categories ?? "[]"),
    runs: JSON.parse(row.runs ?? "[]"),
    is_verified: row.is_verified === 1,
    is_sensitive: row.is_sensitive === 1,
  };
}

const BREACH_SELECT = `
  SELECT
    b.name, b.title, b.domain, b.breach_date, b.added_date, b.modified_date, b.pwn_count,
    b.description, b.attribution, b.disclosure_url, b.data_classes, b.is_verified,
    b.is_sensitive, b.logo_path,
    c.slug, c.name AS company_name, c.runs, c.categories,
    c.address, c.web, c.webform, c.email, c.phone,
    c.suggested_transport_medium
  FROM breaches b
  JOIN companies c ON (',' || c.domains || ',' LIKE '%,' || b.domain || ',%')
  WHERE b.domain IS NOT NULL AND b.domain != ''
`;

function withCompanies(db: Database.Database): void {
  db.exec(`ATTACH DATABASE '${join(RESOURCES_DIR, "companies.db")}' AS companies`);
}

export function getBreachedCompanies(since = "2024-01-01"): BreachRecord[] {
  const db = openDb("breaches.db");
  withCompanies(db);
  const rows = db
    .prepare(`${BREACH_SELECT} AND b.breach_date >= ? ORDER BY b.pwn_count DESC`)
    .all(since) as RawBreachRow[];
  db.close();
  return rows.map(parseBreachRow);
}

export function getBreachBySlug(slug: string): BreachRecord | null {
  const db = openDb("breaches.db");
  withCompanies(db);
  const row = db
    .prepare(`${BREACH_SELECT} AND c.slug = ? ORDER BY b.pwn_count DESC LIMIT 1`)
    .get(slug) as RawBreachRow | undefined;
  db.close();
  return row ? parseBreachRow(row) : null;
}

export function getEnforcementBySlug(slug: string): EnforcementRecord[] {
  const db = openDb("enforcement.db");
  const rows = db
    .prepare(
      `SELECT etid, controller, fine_eur, decision_date, authority,
              dpa_country, articles_violated, violation_type, description, source_url
       FROM enforcement WHERE company_slug = ? ORDER BY decision_date DESC`
    )
    .all(slug) as Array<EnforcementRecord & {
      dpa_country: string | null;
      articles_violated: string | null;
      violation_type: string | null;
      description: string | null;
      source_url: string | null;
    }>;
  db.close();
  return rows.map((row) => ({
    ...row,
    dpa_country: row.dpa_country ?? undefined,
    articles_violated: row.articles_violated ?? undefined,
    violation_type: row.violation_type ?? undefined,
    description: row.description ?? undefined,
    source_url: row.source_url ?? undefined,
  }));
}
