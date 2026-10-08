import { checkoutUrl, getCryptoPayPricing } from "./pricing";

it("sends each selected plan directly to its product checkout", () => {
  for (const plan of ["annual", "cleanup"] as const) {
    const url = new URL(checkoutUrl(plan));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://buy.polar.sh/polar_cl_Xw4DvPpmzCehGjZMTlePIVE8UxO63FGtfw1bR3FnaxG",
    );
  }
  expect(new URL(checkoutUrl("annual")).searchParams.get("product_id")).toBe(
    "0c74b8ca-6492-42c9-867f-659617203246",
  );
  expect(new URL(checkoutUrl("cleanup")).searchParams.get("product_id")).toBe(
    "e6f951f0-4655-400b-8b14-06d81e5a1d62",
  );
});

it("uses the correct crypto prices and carries each plan into payment instructions", () => {
  expect(getCryptoPayPricing("annual")).toEqual({
    priceUsd: 55,
    planName: "Paperweight Pro",
    duration: "1 year",
    renewal: "One payment for one year. Renew manually by contacting us.",
  });
  expect(getCryptoPayPricing("cleanup")).toEqual({
    priceUsd: 25,
    planName: "Cleanup Pass",
    duration: "30 days",
    renewal: "One payment for 30 days. No subscription or renewal.",
  });
});
