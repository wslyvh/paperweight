import { queryPiiOverview } from "./pii-query";
import type { PiiOverview, PiiValue } from "./types";

function value(
  ref: number,
  type: PiiValue["type"],
  maskedValue: string,
  companyCount: number,
  options: Partial<PiiValue> = {},
): PiiValue {
  return {
    ref,
    type,
    maskedValue,
    companyCount,
    lastSeen: ref * 100,
    ...options,
  };
}

describe("queryPiiOverview", () => {
  const overview: PiiOverview = {
    values: [
      value(1, "email", "a•••@e••.com", 3),
      value(2, "phone", "+31 •••• 42", 1, { isForeignFormat: true }),
      value(3, "iban", "NL •••• 1234", 1, { isMatch: true }),
    ],
    suppressedValues: [value(4, "postal_code", "10•••", 1)],
  };

  it("shares confidence and type filtering with the Personal Data page", () => {
    const result = queryPiiOverview(overview, {
      page: 1,
      limit: 25,
      filter: "high",
      sort: "evidence",
    });

    expect(result.items.map((item) => item.ref)).toEqual([1, 3]);
  });

  it("searches display labels and keeps suppressed values separate", () => {
    const result = queryPiiOverview(overview, {
      page: 1,
      limit: 25,
      search: "postal",
      filter: "suppressed",
      sort: "last_seen",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.ref).toBe(4);
  });

  it("lets the App include explicitly revealed values without changing MCP defaults", () => {
    const revealed = new Map([[2, "+31612345642"]]);
    const result = queryPiiOverview(overview, {
      page: 1,
      limit: 25,
      search: "123456",
    }, revealed);

    expect(result.items.map((item) => item.ref)).toEqual([2]);
  });
});
