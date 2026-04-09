import type { BreachRecord, EnforcementRecord } from "./db";

const MODEL = "google/gemini-2.5-flash";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatFine(eur: number): string {
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `€${(eur / 1_000).toFixed(0)}K`;
  return `€${eur}`;
}

function buildContext(breach: BreachRecord, enforcement: EnforcementRecord[]): string {
  const lines = [
    `Company: ${breach.company_name}`,
    `Domain: ${breach.domain}`,
    `Breach date: ${breach.breach_date}`,
    `Records affected: ${formatCount(breach.pwn_count)}`,
    `Data exposed: ${breach.data_classes.join(", ")}`,
    `Verified: ${breach.is_verified ? "Yes (confirmed by Have I Been Pwned)" : "Unverified"}`,
    `Background: ${stripHtml(breach.description)}`,
  ];

  if (enforcement.length > 0) {
    const fineLines = enforcement.map(
      (e) =>
        `- ${formatFine(e.fine_eur)} by ${e.authority} on ${e.decision_date}: ${e.violation_type ?? "unspecified violation"}${e.articles_violated ? ` (${e.articles_violated})` : ""}`
    );
    lines.push(`\nGDPR enforcement fines:\n${fineLines.join("\n")}`);
  }

  return lines.join("\n");
}

export async function generateBreachContent(
  breach: BreachRecord,
  enforcement: EnforcementRecord[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const enforcementSection =
    enforcement.length > 0
      ? `\n\n## GDPR Enforcement Record\n1-2 paragraphs. Plain English explanation of the fines. Whether they relate to the breach or are separate violations. Do not invent details not present in the data.`
      : "";

  const system = `You write factual, authoritative content about data breaches for a privacy website. Plain English, no marketing language, no hedging. Write for someone who just found out their data was in this breach and wants to understand what happened and what to do. Naturally SEO-friendly — do not keyword stuff. Return only the markdown sections requested, no preamble or closing remarks.`;

  const user = `Generate content for a data breach page. Return a markdown document with exactly these sections using the ## headings shown:

## About Company
1-2 lines only. Briefly explain who this company is and what it does. Keep factual.

## Incident and Exposure
2-4 paragraphs combining what happened and what was exposed. Cover timeline, known breach details, affected data, and user risk implications based on actual data classes.

## Next Steps
2-3 paragraphs with concrete actions a person should take now. Include practical steps for account security, fraud monitoring, and breach-specific caution.${enforcementSection}

---
${buildContext(breach, enforcement)}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = json.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenRouter");

  return content.trim();
}
