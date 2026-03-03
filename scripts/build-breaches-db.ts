/**
 * Build script: reads data/hibp/breaches.json and creates resources/breaches.db
 *
 * Run manually before building the app:
 *   npx tsx scripts/build-breaches-db.ts
 *
 * Source: https://haveibeenpwned.com/api/v3/breaches
 * Re-fetch the JSON to update breach data before each release.
 *
 * Uses the sqlite3 CLI (no native Node modules needed).
 */

import { readFileSync, mkdirSync, unlinkSync, existsSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");
const SOURCE_PATH = join(ROOT, "data", "hibp", "breaches.json");
const OUT_PATH = join(ROOT, "resources", "breaches.db");

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
  LogoPath: string;
}

function escSql(str: string | null | undefined): string {
  if (str == null) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(`Source not found: ${SOURCE_PATH}`);
    console.error("Fetch it with: curl https://haveibeenpwned.com/api/v3/breaches -o data/hibp/breaches.json");
    process.exit(1);
  }

  const breaches: HibpBreach[] = JSON.parse(readFileSync(SOURCE_PATH, "utf-8"));
  console.log(`Loaded ${breaches.length} breaches from HIBP`);

  mkdirSync(join(ROOT, "resources"), { recursive: true });
  if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);

  const sqlParts: string[] = [
    `CREATE TABLE breaches (
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      domain TEXT,
      breach_date TEXT,
      added_date TEXT,
      pwn_count INTEGER,
      description TEXT,
      data_classes TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0,
      is_sensitive INTEGER NOT NULL DEFAULT 0,
      logo_path TEXT
    );`,
    "BEGIN TRANSACTION;",
  ];

  let withDomain = 0;

  for (const b of breaches) {
    const domain = b.Domain || null;
    if (domain) withDomain++;

    const values = [
      escSql(b.Name),
      escSql(b.Title),
      escSql(domain),
      escSql(b.BreachDate || null),
      escSql(b.AddedDate || null),
      b.PwnCount != null ? String(b.PwnCount) : "NULL",
      escSql(b.Description || null),
      b.DataClasses ? escSql(JSON.stringify(b.DataClasses)) : "NULL",
      b.IsVerified ? "1" : "0",
      b.IsSensitive ? "1" : "0",
      escSql(b.LogoPath || null),
    ].join(",");

    sqlParts.push(`INSERT INTO breaches VALUES (${values});`);
  }

  sqlParts.push("COMMIT;");
  sqlParts.push("CREATE INDEX idx_breaches_domain ON breaches(domain) WHERE domain IS NOT NULL AND domain != '';");
  sqlParts.push("VACUUM;");

  const sql = sqlParts.join("\n");

  execSync(`sqlite3 "${OUT_PATH}"`, {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });

  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Total breaches: ${breaches.length}`);
  console.log(`With domain: ${withDomain}`);
}

main();
