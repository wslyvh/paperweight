import type { PiiValue } from "@shared/types";
import { PII_TYPES } from "./piiLabels";

// How confident we are that a found value is the user's own — the buckets the
// Account Detail panel tabs and the Data page filter on. Derived from the
// factual flags the main process sends, never from a score, and derived here
// only so both surfaces bucket a value identically.
export type FindingConfidence = "high" | "possible" | "low";

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

// Strongest evidence first, then most sensitive type — all four terms are facts
// the main process reported, applied in order rather than weighted.
export function compareFindings(a: PiiValue, b: PiiValue): number {
  const companyDifference = b.companyCount - a.companyCount;
  if (companyDifference !== 0) return companyDifference;
  if (!!a.isMatch !== !!b.isMatch) {
    return a.isMatch ? -1 : 1;
  }
  const typeOrder = PII_TYPES.indexOf(a.type) - PII_TYPES.indexOf(b.type);
  if (typeOrder !== 0) return typeOrder;
  return b.lastSeen - a.lastSeen;
}
