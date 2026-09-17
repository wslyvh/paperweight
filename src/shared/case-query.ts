import type { GdprCaseStatus, GdprCaseSummary } from "./types";

export type CaseStatusFilter = GdprCaseStatus | "needs_attention" | "";
export type CaseSort = "opened_desc" | "opened_asc" | "name";

export interface CaseQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CaseStatusFilter;
  sort?: CaseSort;
}

export interface CaseQueryResult {
  items: GdprCaseSummary[];
  total: number;
  page: number;
  limit: number;
}

/** The Cases page and MCP use this one projection over the domain service. */
export function queryCaseSummaries(
  cases: GdprCaseSummary[],
  query: CaseQuery,
): CaseQueryResult {
  let result = cases;
  if (query.status === "needs_attention") {
    result = result.filter((item) => item.status === "active" && item.nextAction);
  } else if (query.status) {
    result = result.filter((item) => item.status === query.status);
  }

  const search = query.search?.trim().toLowerCase();
  if (search) {
    result = result.filter((item) => item.vendorName.toLowerCase().includes(search));
  }

  const sorted = [...result];
  if (query.sort === "opened_asc") {
    sorted.sort((a, b) => a.openedAt - b.openedAt);
  } else if (query.sort === "name") {
    sorted.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  } else {
    sorted.sort((a, b) => b.openedAt - a.openedAt);
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
