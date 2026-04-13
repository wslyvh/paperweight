import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const CONTENT_DIR = join(process.cwd(), "src", "content", "breaches");

export interface BreachContent {
  aboutCompany: string;
  incidentAndExposure: string;
  nextSteps: string;
  enforcementNarrative?: string;
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
  source?: { name: string; url: string };
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
  company_slug: string;
}

export interface BreachJsonFile {
  slug: string;
  generated_at: string;
  logoUrl?: string;
  breach: BreachRecord;
  enforcement: {
    records: EnforcementRecord[];
    total_fines: number;
  };
  content: BreachContent;
}

function readBreachFile(slug: string): BreachJsonFile | null {
  const filePath = join(CONTENT_DIR, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as BreachJsonFile;
}

export function getBreachFile(slug: string): BreachJsonFile | null {
  return readBreachFile(slug);
}

export function getBreach(slug: string): BreachContent | null {
  return readBreachFile(slug)?.content ?? null;
}

export function getBreachedCompanies(since = "2024-01-01"): BreachRecord[] {
  return getBreachSlugs()
    .map((slug) => {
      const breachFile = getBreachFile(slug);
      if (!breachFile) return undefined;
      const logoPath = breachFile.logoUrl ?? breachFile.breach.logo_path;
      return {
        ...breachFile.breach,
        ...(logoPath ? { logo_path: logoPath } : {}),
      };
    })
    .filter((row): row is BreachRecord => row !== undefined)
    .filter((row) => row.breach_date >= since)
    .sort((a, b) => b.pwn_count - a.pwn_count);
}

export function getBreachBySlug(slug: string): BreachRecord | null {
  return getBreachFile(slug)?.breach ?? null;
}

export function getEnforcementBySlug(slug: string): EnforcementRecord[] {
  return getBreachFile(slug)?.enforcement.records ?? [];
}

export function getBreaches(): BreachContent[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readBreachFile(f.replace(/\.json$/, ""))?.content)
    .filter((b): b is BreachContent => b !== undefined);
}

export function getBreachSlugs(): string[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

export function getBreachLastModified(slug: string): string | undefined {
  return readBreachFile(slug)?.generated_at;
}
