import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractDomains, mapCategories } from "../../scripts/lib/companies.mjs";

const sourceDir = new URL("../../data/datenanfragen/", import.meta.url);
const overridesPath = new URL("../../data/paperweight/paperweight.json", import.meta.url);
const outputDir = new URL("../src/data/", import.meta.url);
const companies = new Map();

function addCompany(company) {
  const categories = mapCategories(company.categories);
  companies.set(company.slug, {
    slug: company.slug,
    name: company.name,
    runs: company.runs,
    categories: categories.length > 0 ? categories : undefined,
    domains: extractDomains(company),
    address: company.address,
    web: company.web,
    webform: company.webform,
    email: company.email,
    phone: company.phone,
    quality: company.quality,
    comments: company.comments,
    suggestedTransportMedium: company["suggested-transport-medium"],
  });
}

for (const file of readdirSync(sourceDir).filter((file) => file.endsWith(".json"))) {
  addCompany(JSON.parse(readFileSync(new URL(file, sourceDir), "utf-8")));
}

if (existsSync(overridesPath)) {
  for (const company of JSON.parse(readFileSync(overridesPath, "utf-8"))) {
    addCompany(company);
  }
}

const outputPath = new URL("companies.generated.json", outputDir);
const list = [...companies.values()].sort((a, b) => a.name.localeCompare(b.name));
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(list)}\n`, "utf-8");
console.info(`Wrote ${list.length} companies to ${fileURLToPath(outputPath)}`);
