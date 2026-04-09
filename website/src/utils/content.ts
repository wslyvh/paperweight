import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const CONTENT_DIR = join(process.cwd(), "src", "content", "breaches");

export interface BreachFrontmatter {
  created_at: string;
  modified_at: string;
}

export interface BreachContent {
  slug: string;
  meta: BreachFrontmatter;
  aboutCompany: string;
  incidentAndExposure: string;
  nextSteps: string;
  enforcementNarrative?: string;
}

export interface ParsedMarkdownFile {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdownFile {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const colon = line.indexOf(": ");
    if (colon !== -1) meta[line.slice(0, colon).trim()] = line.slice(colon + 2).trim();
  }
  return { meta, body: raw.slice(end + 5).trim() };
}

function extractSection(markdown: string, heading: string): string {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  return markdown.match(pattern)?.[1]?.trim() ?? "";
}

function extractFirstSection(markdown: string, headings: string[]): string {
  for (const heading of headings) {
    const section = extractSection(markdown, heading);
    if (section) return section;
  }
  return "";
}

function parseFile(slug: string): BreachContent | null {
  const filePath = join(CONTENT_DIR, `${slug}.md`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  const enforcementRaw = extractSection(body, "GDPR Enforcement Record");

  return {
    slug,
    meta: {
      created_at: meta.created_at ?? "",
      modified_at: meta.modified_at ?? "",
    },
    aboutCompany: extractFirstSection(body, ["About Company", "Hero Summary"]),
    incidentAndExposure: extractFirstSection(body, ["Incident and Exposure", "What Happened"]),
    nextSteps: extractFirstSection(body, ["Next Steps", "What This Means For You"]),
    ...(enforcementRaw ? { enforcementNarrative: enforcementRaw } : {}),
  };
}

export function getBreach(slug: string): BreachContent | null {
  return parseFile(slug);
}

export function getBreaches(): BreachContent[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseFile(f.replace(/\.md$/, "")))
    .filter((b): b is BreachContent => b !== null);
}

export function getBreachSlugs(): string[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getBreachLastModified(slug: string): string | undefined {
  const filePath = join(CONTENT_DIR, `${slug}.md`);
  if (!existsSync(filePath)) return undefined;
  const raw = readFileSync(filePath, "utf-8");
  const { meta } = parseFrontmatter(raw);
  return meta.modified_at || undefined;
}
