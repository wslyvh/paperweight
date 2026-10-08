const CHECKOUT_URL =
  "https://buy.polar.sh/polar_cl_Xw4DvPpmzCehGjZMTlePIVE8UxO63FGtfw1bR3FnaxG";

export const PLANS = {
  annual: {
    name: "Paperweight Pro",
    price: 60,
    cryptoPrice: 55,
    productId: "0c74b8ca-6492-42c9-867f-659617203246",
  },
  cleanup: {
    name: "Cleanup Pass",
    price: 25,
    cryptoPrice: 25,
    productId: "e6f951f0-4655-400b-8b14-06d81e5a1d62",
  },
} as const;

export function checkoutUrl(plan: keyof typeof PLANS) {
  return `${CHECKOUT_URL}?product_id=${PLANS[plan].productId}`;
}

export function getCryptoPayPricing(plan: keyof typeof PLANS = "annual") {
  return {
    priceUsd: PLANS[plan].cryptoPrice,
    planName: PLANS[plan].name,
    duration: plan === "annual" ? "1 year" : "30 days",
    renewal:
      plan === "annual"
        ? "One payment for one year. Renew manually by contacting us."
        : "One payment for 30 days. No subscription or renewal.",
  };
}

export const STANDARD_OFFERS = [
  {
    "@type": "Offer",
    name: "Free",
    price: 0,
    priceCurrency: "USD",
    url: "https://www.paperweight.email/#download",
  },
  {
    "@type": "Offer",
    name: "Paperweight Pro - billed yearly",
    price: PLANS.annual.price,
    priceCurrency: "USD",
    url: checkoutUrl("annual"),
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: PLANS.annual.price,
      priceCurrency: "USD",
      billingDuration: "P1Y",
    },
  },
  {
    "@type": "Offer",
    name: "Cleanup Pass - 30 days",
    price: PLANS.cleanup.price,
    priceCurrency: "USD",
    url: checkoutUrl("cleanup"),
  },
];
