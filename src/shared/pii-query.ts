import { FINDING_SENSITIVITY_ORDER } from "./types";
import type { PiiOverview, PiiType, PiiValue } from "./types";

export const PII_TYPES: PiiType[] = [...FINDING_SENSITIVITY_ORDER];

export const PII_LABELS: Record<PiiType, string> = {
  credit_card: "Card",
  iban: "IBAN",
  national_id: "ID",
  phone: "Phone",
  address: "Address",
  postal_code: "Postal",
  email: "Email",
  date_of_birth: "Birthdate",
};

export type FindingConfidence = "high" | "possible" | "low";
export type PiiValueFilter = FindingConfidence | "exact" | "unclassified" | "suppressed" | "";
export type PiiSort = "evidence" | "last_seen" | "last_seen_asc" | "type";

export interface ConfidenceOption {
  id: FindingConfidence;
  label: string;
  title: string;
}

export const CONFIDENCE_OPTIONS: ConfidenceOption[] = [
  {
    id: "high",
    label: "High",
    title: "Profile matches and values found across multiple companies",
  },
  {
    id: "possible",
    label: "Possible",
    title: "Other values found in these emails",
  },
  {
    id: "low",
    label: "Low",
    title: "Values with a weaker ownership signal",
  },
];

export interface PiiOverviewQuery {
  page: number;
  limit: number;
  search?: string;
  filter?: PiiValueFilter;
  type?: PiiType;
  sort?: PiiSort;
}

export interface PiiOverviewQueryResult {
  items: PiiValue[];
  total: number;
  page: number;
  limit: number;
}

export function getFindingConfidence(value: PiiValue): FindingConfidence {
  if (value.isMatch || value.companyCount > 1) return "high";
  if (value.isForeignFormat || value.isFrequentAtCompany) return "low";
  return "possible";
}

export function groupByConfidence(
  values: PiiValue[],
): Record<FindingConfidence, PiiValue[]> {
  const groups: Record<FindingConfidence, PiiValue[]> = {
    high: [],
    possible: [],
    low: [],
  };
  for (const value of values) groups[getFindingConfidence(value)].push(value);
  return groups;
}

export function compareFindings(a: PiiValue, b: PiiValue): number {
  const companyDifference = b.companyCount - a.companyCount;
  if (companyDifference !== 0) return companyDifference;
  if (!!a.isMatch !== !!b.isMatch) return a.isMatch ? -1 : 1;
  const typeOrder = PII_TYPES.indexOf(a.type) - PII_TYPES.indexOf(b.type);
  if (typeOrder !== 0) return typeOrder;
  return b.lastSeen - a.lastSeen;
}

/** The Personal Data page and MCP use this one projection over the PII overview. */
export function queryPiiOverview(
  overview: PiiOverview,
  query: PiiOverviewQuery,
  revealed?: ReadonlyMap<number, string>,
): PiiOverviewQueryResult {
  let result = query.filter === "suppressed"
    ? overview.suppressedValues
    : overview.values;

  if (query.type) result = result.filter((value) => value.type === query.type);

  const search = query.search?.trim().toLowerCase();
  if (search) {
    result = result.filter((value) =>
      PII_LABELS[value.type].toLowerCase().includes(search)
      || value.maskedValue.toLowerCase().includes(search)
      || !!revealed?.get(value.ref)?.toLowerCase().includes(search)
    );
  }

  if (query.filter === "exact") {
    result = result.filter((value) => value.isMatch);
  } else if (query.filter === "unclassified") {
    result = result.filter((value) => !value.isMatch);
  } else if (
    query.filter
    && query.filter !== "suppressed"
  ) {
    result = result.filter((value) => getFindingConfidence(value) === query.filter);
  }

  const sorted = [...result];
  if (query.sort === "last_seen") {
    sorted.sort((a, b) => b.lastSeen - a.lastSeen);
  } else if (query.sort === "last_seen_asc") {
    sorted.sort((a, b) => a.lastSeen - b.lastSeen);
  } else if (query.sort === "type") {
    sorted.sort(
      (a, b) => PII_TYPES.indexOf(a.type) - PII_TYPES.indexOf(b.type)
        || b.lastSeen - a.lastSeen,
    );
  } else {
    sorted.sort(compareFindings);
  }

  const page = Math.max(1, Math.floor(query.page));
  const limit = Math.max(1, Math.floor(query.limit));
  const offset = (page - 1) * limit;
  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    page,
    limit,
  };
}
