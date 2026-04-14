/**
 * Brave Search helper for grounding breach-content generation.
 *
 * One freshness value, two queries per breach, optional single WebFetch
 * of the company's own domain for remediation guidance.
 */

import type { GroundingSource } from "./llm.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

interface BraveWebResult {
  url: string;
  title: string;
  description: string;
}

interface BraveWebSearchResponse {
  web?: { results?: BraveWebResult[] };
}

export function pickFreshness(addedDate: string): "pw" | "pm" {
  const added = new Date(addedDate).getTime();
  const ageDays = (Date.now() - added) / (1000 * 60 * 60 * 24);
  return ageDays <= 30 ? "pw" : "pm";
}

async function braveQuery(query: string, freshness: "pw" | "pm"): Promise<BraveWebResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error("BRAVE_API_KEY is not set");

  const params = new URLSearchParams({
    q: query,
    count: "10",
    freshness,
    safesearch: "moderate",
  });
  const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brave ${res.status}: ${body}`);
  }
  const json = (await res.json()) as BraveWebSearchResponse;
  return json.web?.results ?? [];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; paperweight-content-generator/1.0; +https://www.paperweight.email)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const text = stripHtmlToText(html);
    return text.length > 200 ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs two Brave queries (broad + company-scoped), dedupes by URL, takes top
 * 8 results. Full-fetches up to two pages for deeper grounding:
 *   1. The HIBP disclosure_url if provided (company's own breach notice).
 *   2. The first result matching the company's primary domain, or — if no
 *      domain-match — the top Brave result, so the LLM always gets at least
 *      one rich document to work from.
 */
export async function buildGroundingSources(opts: {
  companyName: string;
  primaryDomain?: string;
  breachDate: string;
  addedDate: string;
  disclosureUrl?: string;
}): Promise<GroundingSource[]> {
  const freshness = pickFreshness(opts.addedDate);
  const year = opts.breachDate.slice(0, 4);

  const queries = [`"${opts.companyName}" data breach ${year}`];
  if (opts.primaryDomain) {
    queries.push(`"${opts.companyName}" data breach site:${opts.primaryDomain}`);
  }

  const allResults: BraveWebResult[] = [];
  for (const q of queries) {
    const r = await braveQuery(q, freshness);
    allResults.push(...r);
  }

  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const top = deduped.slice(0, 8);
  const sources: GroundingSource[] = top.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.description,
  }));

  // 1. Fetch the official disclosure page if HIBP provided one.
  if (opts.disclosureUrl) {
    const content = await fetchPageText(opts.disclosureUrl);
    if (content) {
      const existing = sources.find((s) => s.url === opts.disclosureUrl);
      if (existing) {
        existing.content = content;
      } else {
        sources.unshift({
          url: opts.disclosureUrl,
          title: `${opts.companyName} disclosure`,
          snippet: "",
          content,
        });
      }
    }
  }

  // 2. Fetch one Brave result: prefer company-domain match, fall back to top.
  const companyHost = opts.primaryDomain?.replace(/^www\./, "");
  const alreadyFull = new Set(sources.filter((s) => s.content).map((s) => s.url));
  const domainMatch = companyHost
    ? sources.find((s) => !alreadyFull.has(s.url) && hostOf(s.url).endsWith(companyHost))
    : undefined;
  const target = domainMatch ?? sources.find((s) => !alreadyFull.has(s.url));
  if (target) {
    const content = await fetchPageText(target.url);
    if (content) target.content = content;
  }

  return sources;
}
