import { queryCaseSummaries } from "./case-query";
import type { GdprCaseSummary } from "./types";

function caseSummary(
  id: number,
  vendorName: string,
  status: "active" | "closed",
  openedAt: number,
  nextAction?: "reminder" | "followup" | "escalate",
): GdprCaseSummary {
  return {
    id,
    vendorId: id,
    vendorName,
    requestType: "access",
    status,
    openedAt,
    nextAction,
    hasUnseenReply: false,
  };
}

describe("queryCaseSummaries", () => {
  const cases = [
    caseSummary(1, "Zebra", "active", 100),
    caseSummary(2, "Alpha", "active", 300, "reminder"),
    caseSummary(3, "Beta", "closed", 200),
  ];

  it("uses the Cases page attention and search semantics", () => {
    expect(queryCaseSummaries(cases, {
      page: 1,
      limit: 20,
      search: "alp",
      status: "needs_attention",
      sort: "opened_desc",
    }).items.map((item) => item.id)).toEqual([2]);
  });

  it("sorts and paginates after filtering", () => {
    const result = queryCaseSummaries(cases, {
      page: 2,
      limit: 1,
      status: "",
      sort: "name",
    });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.vendorName)).toEqual(["Beta"]);
  });
});
