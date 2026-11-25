import type Database from "better-sqlite3";

export interface BreachRow {
  name: string;
  title: string;
  domain: string;
  breach_date: string;
  pwn_count: number;
  description?: string;
  data_classes?: string;
  is_verified: number;
  is_sensitive: number;
}

// SQLite's default LIKE folds ASCII case only; equality remains case-sensitive.
const foldAscii = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());

function subdomainPattern(domain: string): RegExp {
  const pattern = Array.from(foldAscii(`%.${domain}`), (c) => {
    if (c === "%") return ".*";
    if (c === "_") return ".";
    return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return new RegExp(`^${pattern}$`, "su");
}

function createLookup(rows: BreachRow[]) {
  const patterns = rows
    .filter((row) => typeof row.domain === "string")
    .map((row) => ({ row, suffix: subdomainPattern(row.domain) }));
  const matches = new Map<string, BreachRow[]>();
  return {
    find(domain: string): BreachRow[] {
      const cached = matches.get(domain);
      if (cached) return cached;
      const folded = foldAscii(domain);
      const result = patterns
        .filter(({ row, suffix }) => row.domain === domain || suffix.test(folded))
        .map(({ row }) => row);
      matches.set(domain, result);
      return result;
    },
  };
}

const lookups = new WeakMap<Database.Database, ReturnType<typeof createLookup>>();
export const ON_BREACH_LIST_SQL = "has_breach(vendors.root_domain)";

// The bundled reference data is fixed for this connection. Keep matches in
// memory, including misses; account switches/reopens get a fresh lookup.
export function getBreachLookup(d: Database.Database) {
  const cached = lookups.get(d);
  if (cached) return cached;
  if (!d.prepare("SELECT 1 FROM pragma_database_list WHERE name = 'breaches'").get()) return;
  if (!d.prepare("SELECT 1 FROM breaches.sqlite_master WHERE type = 'table' AND name = 'breaches'").get()) return;

  const rows = d.prepare(`
    SELECT name, title, domain, breach_date, pwn_count, description,
           data_classes, is_verified, is_sensitive
    FROM breaches.breaches ORDER BY breach_date DESC
  `).all() as BreachRow[];
  const lookup = createLookup(rows);
  d.function("has_breach", (domain) =>
    typeof domain === "string" && lookup.find(domain).length > 0 ? 1 : 0,
  );
  lookups.set(d, lookup);
  return lookup;
}
