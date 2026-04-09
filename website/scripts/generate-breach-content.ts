/**
 * Generates LLM content for a breach page and writes it to src/content/breaches/{slug}.md
 *
 * Usage:
 *   tsx --env-file .env scripts/generate-breach-content.ts --slug odido
 *   tsx --env-file .env scripts/generate-breach-content.ts --slug odido --force
 *
 * Requires OPENROUTER_API_KEY in .env or environment.
 * Skips generation if the .md file already exists unless --force is passed.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBreachBySlug, getEnforcementBySlug } from "../src/utils/db.js";
import { generateBreachContent } from "../src/utils/llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const slugIdx = args.indexOf("--slug");
const force = args.includes("--force");

if (slugIdx === -1 || !args[slugIdx + 1]) {
  console.error(
    "Usage: tsx --env-file .env scripts/generate-breach-content.ts --slug <slug> [--force]",
  );
  process.exit(1);
}

const slug = args[slugIdx + 1];
const outputDir = join(__dirname, "..", "src", "content", "breaches");
const outputPath = join(outputDir, `${slug}.md`);

if (existsSync(outputPath) && !force) {
  console.log(`[skip] ${slug}.md already exists — pass --force to regenerate`);
  process.exit(0);
}

const breach = getBreachBySlug(slug);
if (!breach) {
  console.error(`[error] No breach found for company slug: "${slug}"`);
  console.error(`        Run getBreachedCompanies() to see available slugs.`);
  process.exit(1);
}
const enforcement = getEnforcementBySlug(slug);

console.log(`[${slug}] ${breach.title}`);
console.log(
  `[${slug}] ${breach.pwn_count.toLocaleString()} records · ${breach.breach_date}`,
);
console.log(`[${slug}] Data: ${breach.data_classes.join(", ")}`);
if (enforcement.length > 0) {
  console.log(`[${slug}] Enforcement: ${enforcement.length} GDPR fine(s)`);
}

console.log(
  `[${slug}] Calling OpenRouter (${process.env.OPENROUTER_API_KEY ? "key set" : "NO KEY — will fail"})...`,
);

async function main() {
  const content = await generateBreachContent(selectedBreach, enforcement);

  const today = new Date().toISOString().split("T")[0];
  const frontmatter = [
    "---",
    `created_at: ${today}`,
    `modified_at: ${today}`,
    "---",
    "",
    "",
  ].join("\n");

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, frontmatter + content, "utf-8");

  console.log(`[${slug}] Written to src/content/breaches/${slug}.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
