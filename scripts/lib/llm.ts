const MODEL = "google/gemini-2.5-flash";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface BreachLlmInput {
  company_name: string;
  domain: string;
  breach_date: string;
  pwn_count: number;
  data_classes: string[];
  is_verified: boolean;
  description: string;
}

export interface EnforcementLlmInput {
  fine_eur: number;
  authority: string;
  decision_date: string;
  violation_type?: string;
  articles_violated?: string;
}

export interface BreachLlmSections {
  aboutCompany: string;
  incidentAndExposure: string;
  nextSteps: string;
  enforcementNarrative?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatFine(eur: number): string {
  if (eur >= 1_000_000) return `EUR ${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `EUR ${(eur / 1_000).toFixed(0)}K`;
  return `EUR ${eur}`;
}

function buildContext(breach: BreachLlmInput, enforcement: EnforcementLlmInput[]): string {
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
        `- ${formatFine(e.fine_eur)} by ${e.authority} on ${e.decision_date}: ${e.violation_type ?? "unspecified violation"}${e.articles_violated ? ` (${e.articles_violated})` : ""}`,
    );
    lines.push(`GDPR enforcement fines:\n${fineLines.join("\n")}`);
  }

  return lines.join("\n");
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSections(raw: string): BreachLlmSections {
  const parsed = JSON.parse(stripCodeFences(raw)) as Partial<BreachLlmSections>;
  if (!parsed.aboutCompany || !parsed.incidentAndExposure || !parsed.nextSteps) {
    throw new Error("LLM output missing required content fields");
  }
  return {
    aboutCompany: parsed.aboutCompany.trim(),
    incidentAndExposure: parsed.incidentAndExposure.trim(),
    nextSteps: parsed.nextSteps.trim(),
    ...(parsed.enforcementNarrative ? { enforcementNarrative: parsed.enforcementNarrative.trim() } : {}),
  };
}

export async function generateBreachContentSections(
  breach: BreachLlmInput,
  enforcement: EnforcementLlmInput[],
): Promise<BreachLlmSections> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const system =
    "You write factual, authoritative content about data breaches for a privacy website. Plain English, no marketing language, no hedging. Write for someone who just found out their data was in this breach and wants to understand what happened and what to do. Naturally SEO-friendly, but do not keyword stuff. Return valid JSON only with the requested keys.";

  const user = `Return exactly one JSON object with these keys:
- aboutCompany (string, 1-2 lines)
- incidentAndExposure (string, 2-4 paragraphs combining what happened and what was exposed. Cover timeline, known breach details, affected data, and user risk implications based on actual data classes.)
- nextSteps (string, 2-3 paragraphs with concrete actions a person should take now. Include practical steps for account security, fraud monitoring, and breach-specific caution.)
- enforcementNarrative (string, optional; include only when enforcement data exists)

Use only the provided facts. Do not invent details not present in the data.
Do not include markdown headings in any field value.

Context:
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
      response_format: { type: "json_object" },
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

  return parseSections(content);
}
