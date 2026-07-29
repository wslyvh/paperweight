import type { Dpa } from "@shared/gdpr/types";
import { findDpaByAddress, findDpaByDomain } from "@shared/gdpr/resolution";
import { RISK_CATEGORIES, RISK_LEVELS } from "@shared/vendor-risk";
import {
  getBreachBySlug,
  getBreachedCompanies,
  getBreachFile,
  getBreachLastModified,
  getBreachSlugs,
  getEnforcementBySlug,
  type BreachContent,
  type BreachRecord,
  type EnforcementRecord,
} from "./content";

interface RiskSeverity {
  level: "high" | "medium" | "low";
  badgeClass: string;
}

export interface BreachIndexItem {
  slug: string;
  title: string;
  logoPath?: string;
  breachDate: string;
  addedDate: string;
  pwnCount: number;
  dataClasses: string[];
  categoryLabel?: string;
  categoryIcon?: string;
  riskLabel: string;
  riskBadgeClass: string;
}

export interface BreachPageModel {
  slug: string;
  metadata: {
    title: string;
    description: string;
  };
  company: {
    name: string;
    website?: string;
    domain: string;
    categoryLabel?: string;
    categoryIcon?: string;
    runs: string[];
    logoPath?: string;
    about: string;
    address?: string;
    webform?: string;
    email?: string;
  };
  breach: {
    date: string;
    pwnCount: number;
    description: string;
    isVerified: boolean;
    isSensitive: boolean;
    disclosureUrl?: string;
    dataClasses: string[];
    riskLabel: string;
    riskBadgeClass: string;
    source: { name: string; url: string };
  };
  content: {
    keyTakeaways?: string[];
    incidentAndExposure: string;
    timelineAndCause?: string;
    nextSteps: string;
    enforcementNarrative?: string;
  };
  enforcement: {
    records: EnforcementRecord[];
    totalFines: number;
  };
  dpa?: Dpa;
  actions: {
    disclosureUrl?: string;
    contactUrl?: string;
  };
}

export interface BreachSitemapEntry {
  slug: string;
  lastModified?: string;
}

export function formatCount(n: number): string {
  if (n <= 0) return "Unknown";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function formatFine(eur: number): string {
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `€${(eur / 1_000).toFixed(0)}K`;
  return `€${eur}`;
}

function getSeverityFromDataClasses(classes: string[]): RiskSeverity {
  const high = ["passport", "government issued", "driver", "bank account", "credit card", "social security", "health", "medical"];
  const medium = ["password", "date of birth", "phone", "physical address", "financial"];
  const lc = classes.map((c) => c.toLowerCase());
  if (high.some((h) => lc.some((c) => c.includes(h)))) {
    return { level: "high", badgeClass: "badge-error" };
  }
  if (medium.some((m) => lc.some((c) => c.includes(m)))) {
    return { level: "medium", badgeClass: "badge-warning" };
  }
  return { level: "low", badgeClass: "badge-success" };
}

function mapCategoryInfo(categories: string[]): { label?: string; icon?: string } {
  const primaryCategory = categories[0] as keyof typeof RISK_CATEGORIES | undefined;
  const catInfo = primaryCategory ? RISK_CATEGORIES[primaryCategory] : undefined;
  if (!catInfo) return {};
  return { label: catInfo.label, icon: catInfo.icon };
}

function buildIndexItem(breach: BreachRecord): BreachIndexItem {
  const severity = getSeverityFromDataClasses(breach.data_classes);
  const category = mapCategoryInfo(breach.categories);
  return {
    slug: breach.slug,
    title: breach.title,
    logoPath: breach.logo_path,
    breachDate: breach.breach_date,
    addedDate: breach.added_date,
    pwnCount: breach.pwn_count,
    dataClasses: breach.data_classes,
    categoryLabel: category.label,
    categoryIcon: category.icon,
    riskLabel: RISK_LEVELS[severity.level].label,
    riskBadgeClass: severity.badgeClass,
  };
}

function buildMetadata(breach: BreachRecord) {
  const title = `${breach.title} Data Breach - What to do`;
  const year = breach.breach_date.slice(0, 4);
  const description =
    breach.pwn_count > 0
      ? `${formatCount(breach.pwn_count)} records exposed in the ${breach.title} breach (${year}). Find out what data was leaked and the steps to take to protect yourself.`
      : `Records exposed in the ${breach.title} breach (${year}) have not been disclosed. Find out what data was leaked and the steps to take to protect yourself.`;
  return { title, description };
}

function buildBreachModel(
  slug: string,
  breach: BreachRecord,
  content: BreachContent,
  enforcement: EnforcementRecord[],
  logoPath?: string,
): BreachPageModel {
  const severity = getSeverityFromDataClasses(breach.data_classes);
  const category = mapCategoryInfo(breach.categories);
  const totalFines = enforcement.reduce((sum, row) => sum + row.fine_eur, 0);
  const dpa =
    findDpaByAddress(breach.address ?? null, enforcement[0]?.dpa_country) ??
    findDpaByDomain(breach.domain);
  const contactUrl = breach.webform ?? (breach.email ? `mailto:${breach.email}` : undefined);

  return {
    slug,
    metadata: buildMetadata(breach),
    company: {
      name: breach.company_name,
      website: breach.web,
      domain: breach.domain,
      categoryLabel: category.label,
      categoryIcon: category.icon,
      runs: breach.runs,
      logoPath: logoPath ?? breach.logo_path,
      about: content.aboutCompany,
      address: breach.address,
      webform: breach.webform,
      email: breach.email,
    },
    breach: {
      date: breach.breach_date,
      pwnCount: breach.pwn_count,
      description: breach.description,
      isVerified: breach.is_verified,
      isSensitive: breach.is_sensitive,
      disclosureUrl: breach.disclosure_url,
      dataClasses: breach.data_classes,
      riskLabel: RISK_LEVELS[severity.level].label,
      riskBadgeClass: severity.badgeClass,
      source: breach.source ?? {
        name: "haveibeenpwned.com",
        url: `https://haveibeenpwned.com/Breach/${breach.name}`,
      },
    },
    content: {
      keyTakeaways: content.keyTakeaways,
      incidentAndExposure: content.incidentAndExposure,
      timelineAndCause: content.timelineAndCause,
      nextSteps: content.nextSteps,
      enforcementNarrative: content.enforcementNarrative,
    },
    enforcement: {
      records: enforcement,
      totalFines,
    },
    ...(dpa ? { dpa } : {}),
    actions: {
      disclosureUrl: breach.disclosure_url,
      contactUrl,
    },
  };
}

export function getBreachIndexItems(): BreachIndexItem[] {
  return getBreachedCompanies()
    .sort((a, b) => (b.added_date || b.breach_date).localeCompare(a.added_date || a.breach_date))
    .map(buildIndexItem);
}

/** Number of related breaches surfaced on a breach detail page. */
export const RELATED_LIMIT = 3;

function resolveDpaName(breach: BreachRecord): string | undefined {
  const enforcement = getEnforcementBySlug(breach.slug);
  const dpa =
    findDpaByAddress(breach.address ?? null, enforcement[0]?.dpa_country) ??
    findDpaByDomain(breach.domain);
  return dpa?.dpaName;
}

/**
 * Ranks other breaches by how related they are to `slug`, to build an internal
 * link network between breach pages. Signals, strongest first:
 *   +7 shared category (same sector) · +5 same attacker (attribution)
 *   +4 same data protection authority · +1 per shared data class (max +3)
 *   +1 breaches within ~90 days of each other
 * Sector is the dominant signal: for a reader, "other breaches in this industry"
 * is the most useful relation, so a same-sector breach outranks a same-attacker
 * breach from an unrelated sector (e.g. a telco breach surfaces other telcos
 * before a clothing-retail breach that happens to share the same attacker).
 * Sorted by score, then recency. Falls back to most-recent if nothing scores,
 * so every page links to at least `limit` others.
 */
export function getRelatedBreaches(
  slug: string,
  limit = RELATED_LIMIT,
): BreachIndexItem[] {
  const all = getBreachedCompanies();
  const target = all.find((b) => b.slug === slug);
  if (!target) return [];

  const targetDpa = resolveDpaName(target);
  const targetCategories = new Set(target.categories);
  const targetClasses = new Set(target.data_classes);
  const targetTime = new Date(target.breach_date).getTime();

  const scored = all
    .filter((b) => b.slug !== slug)
    .map((breach) => {
      let score = 0;
      if (target.attribution && breach.attribution === target.attribution) {
        score += 5;
      }
      if (breach.categories.some((c) => targetCategories.has(c))) score += 7;
      if (targetDpa && resolveDpaName(breach) === targetDpa) score += 4;
      const shared = breach.data_classes.filter((d) =>
        targetClasses.has(d),
      ).length;
      score += Math.min(shared, 3);
      const days =
        Math.abs(targetTime - new Date(breach.breach_date).getTime()) /
        86_400_000;
      if (days <= 90) score += 1;
      return { breach, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.breach.breach_date.localeCompare(a.breach.breach_date),
    );

  const ranked = scored.filter((s) => s.score > 0);
  return (ranked.length ? ranked : scored)
    .slice(0, limit)
    .map((s) => buildIndexItem(s.breach));
}

export function getBreachPageModel(slug: string): BreachPageModel | null {
  const breachFile = getBreachFile(slug);
  if (!breachFile) return null;
  const breach = getBreachBySlug(slug);
  if (!breach) return null;

  const enforcement = getEnforcementBySlug(slug);
  return buildBreachModel(
    slug,
    breach,
    breachFile.content,
    enforcement,
    breachFile.logoUrl ?? breach.logo_path,
  );
}

export function getBreachSitemapEntries(): BreachSitemapEntry[] {
  return getBreachSlugs().map((slug) => ({
    slug,
    lastModified: getBreachLastModified(slug),
  }));
}
