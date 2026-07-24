// Scaffold a fixture from a real .eml: copies the input and writes a DRAFT
// expected.json from the current engine output. The draft is a starting point;
// review and edit it before committing — never auto-trust generated expectations.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMessage, parseEml } from "../src/index";
import type { Analysis } from "../src/types";

const [emlPath, caseName] = process.argv.slice(2);

if (!emlPath || !caseName || !/^[a-z0-9-]+$/.test(caseName)) {
  console.error("usage: yarn new-fixture <file.eml> <case-name>  (case-name: kebab-case)");
  process.exit(1);
}

const fixtureDir = join(fileURLToPath(new URL("../fixtures", import.meta.url)), caseName);
if (existsSync(fixtureDir)) {
  console.error(`fixture "${caseName}" already exists at ${fixtureDir}`);
  process.exit(1);
}

const message = await parseEml(new Uint8Array(readFileSync(emlPath)));
const analysis = await analyzeMessage(message);

mkdirSync(fixtureDir, { recursive: true });
copyFileSync(emlPath, join(fixtureDir, "input.eml"));
writeFileSync(join(fixtureDir, "expected.json"), JSON.stringify(draftExpected(analysis), null, 2) + "\n");

console.info(`created fixtures/${caseName}/ — review and edit expected.json before committing`);

function draftExpected(a: Analysis): Record<string, unknown> {
  const draft: Record<string, unknown> = {
    type: a.type,
    lang: a.lang,
    findings: a.findings.map((f) => ({
      type: f.type,
      valueNormalized: f.valueNormalized,
      confidence: f.confidence,
      ...(f.country ? { country: f.country } : {}),
    })),
  };
  if (a.unsubscribe) draft["unsubscribe"] = a.unsubscribe;
  return draft;
}
