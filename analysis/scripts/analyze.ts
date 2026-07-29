// Dev CLI: print the Analysis (or the intermediate RawMessage with --raw) for
// a real mail file. Prints message-derived data to stdout by design; dev tool,
// not a product.
import { readFileSync } from "node:fs";
import { analyzeMessage, analyzeText, parseEml } from "../src/index";

const args = process.argv.slice(2);
const printRaw = args.includes("--raw");
const file = args.find((arg) => !arg.startsWith("--"));

if (!file) {
  console.error("usage: yarn analyze <file.eml|file.txt> [--raw]");
  process.exit(1);
}

if (file.endsWith(".eml")) {
  const message = await parseEml(new Uint8Array(readFileSync(file)));
  const output = printRaw ? message : await analyzeMessage(message);
  console.info(JSON.stringify(output, null, 2));
} else {
  console.info(JSON.stringify(await analyzeText(readFileSync(file, "utf8")), null, 2));
}
