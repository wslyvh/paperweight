const MODEL = "google/gemini-2.5-flash";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface BreachLlmInput {
  company_name: string;
  domain: string;
  breach_date: string;
  added_date: string;
  pwn_count: number;
  data_classes: string[];
  is_verified: boolean;
  description: string;
  attribution?: string;
}

export interface EnforcementLlmInput {
  fine_eur: number;
  authority: string;
  decision_date: string;
  violation_type?: string;
  articles_violated?: string;
}

export interface ContextSignal {
  type: "same-attribution" | "same-country" | "same-sector";
  company: string;
  breach_date: string;
  pwn_count: number;
  attribution?: string;
}

export interface GroundingSource {
  url: string;
  title: string;
  snippet: string;
  content?: string;
}

export interface BreachLlmSections {
  aboutCompany: string;
  keyTakeaways: string[];
  incidentAndExposure: string;
  timelineAndCause: string;
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

function buildContext(
  breach: BreachLlmInput,
  enforcement: EnforcementLlmInput[],
  signals: ContextSignal[],
  sources: GroundingSource[],
): string {
  const lines = [
    `Company: ${breach.company_name}`,
    `Domain: ${breach.domain}`,
    `Breach date: ${breach.breach_date}`,
    `Disclosure date: ${breach.added_date}`,
    `Records affected: ${formatCount(breach.pwn_count)}`,
    `Data exposed: ${breach.data_classes.join(", ")}`,
    `Verified: ${breach.is_verified ? "Yes (confirmed by Have I Been Pwned)" : "Unverified"}`,
  ];
  if (breach.attribution) lines.push(`Attribution: ${breach.attribution}`);
  lines.push(`Background: ${stripHtml(breach.description)}`);

  if (signals.length > 0) {
    const signalLines = signals.map(
      (s) =>
        `- [${s.type}] ${s.company} — ${s.breach_date}, ${formatCount(s.pwn_count)} records${s.attribution ? `, attributed to ${s.attribution}` : ""}`,
    );
    lines.push(`Context signals (related breaches from our data):\n${signalLines.join("\n")}`);
  }

  if (sources.length > 0) {
    const sourceLines = sources.map((src) => {
      const body = src.content ? `\n  Body: ${src.content.slice(0, 4000)}` : "";
      return `- ${src.url} — ${src.title}\n  Snippet: ${src.snippet}${body}`;
    });
    lines.push(`Grounding sources (use as facts, do not fabricate beyond these):\n${sourceLines.join("\n")}`);
  }

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
  if (
    !parsed.aboutCompany ||
    !parsed.incidentAndExposure ||
    !parsed.timelineAndCause ||
    !parsed.nextSteps ||
    !Array.isArray(parsed.keyTakeaways) ||
    parsed.keyTakeaways.length !== 3
  ) {
    throw new Error("LLM output missing required content fields or keyTakeaways not length 3");
  }
  return {
    aboutCompany: parsed.aboutCompany.trim(),
    keyTakeaways: parsed.keyTakeaways.map((s) => String(s).trim()),
    incidentAndExposure: parsed.incidentAndExposure.trim(),
    timelineAndCause: parsed.timelineAndCause.trim(),
    nextSteps: parsed.nextSteps.trim(),
    ...(parsed.enforcementNarrative ? { enforcementNarrative: parsed.enforcementNarrative.trim() } : {}),
  };
}

export async function generateBreachContentSections(
  breach: BreachLlmInput,
  enforcement: EnforcementLlmInput[],
  signals: ContextSignal[] = [],
  sources: GroundingSource[] = [],
): Promise<BreachLlmSections> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const system =
    "You write factual content about data breaches for a privacy information site. The audience is a person whose data may have been exposed — not a security analyst. Use plain language. Lead with concrete specifics: dates, numbers, named data types, what the affected person should do. No marketing, no hedging, no filler. State only facts present in the provided context; if attribution, vectors, record counts, affected geographies, or company responses are not in the context, omit them rather than invent or guess. Return valid JSON only with the requested keys.";

  const user = `Return exactly one JSON object with these keys:

- aboutCompany (string, 1-2 lines: what the company does and where it operates)

- keyTakeaways (array of exactly 3 strings, one sentence each, plain language, no citations, no markdown):
  [0] Breach specifics: what data was exposed, for how many people, when.
  [1] Broader context: if context signals are provided, pick the strongest (same-attribution > same-country > same-sector) and write a one-line pattern framing; if no signals, write a one-line framing of the most material consequence (e.g., largest of its kind, first of a new pattern, concentration in a sector). Never invent a pattern.
  [2] User-facing stakes: the single most material risk for an affected person, or the one most important action they should take.
  Derive these bullets from the other sections you are writing. Do not introduce facts not in the context.

- incidentAndExposure (2-3 paragraphs: scale — records, people, countries if known; data types exposed; state explicitly whether the company has publicly acknowledged the incident based on the grounding sources)

- timelineAndCause (1-2 paragraphs: when the breach occurred and when it was disclosed; how it happened if stated in the sources. Name an attacker or campaign ONLY if an "Attribution:" line is present in the context. Otherwise do not speculate.)

- nextSteps (1-2 paragraphs: concrete actions for affected people. If the grounding sources include the company's own remediation guidance — password reset instructions, fraud hotline, credit monitoring offer, etc. — repeat it specifically. Otherwise recommend general measures appropriate to the specific data types exposed.)

- enforcementNarrative (string, optional, 1 short paragraph; include only when GDPR enforcement fines are provided in the context)

Rules:
- Never invent attribution, attack vectors, record counts, affected geographies, or company responses.
- Do not include markdown headings, bullets, or links inside any field value.
- Write in plain language. Avoid "threat actor", "malicious actor", "compromise" as jargon. Prefer "attacker", "exposed", "stolen".

Context:
${buildContext(breach, enforcement, signals, sources)}`;

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
