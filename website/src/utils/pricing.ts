const CHECKOUT_URL =
  "https://buy.polar.sh/polar_cl_Xw4DvPpmzCehGjZMTlePIVE8UxO63FGtfw1bR3FnaxG";

// Disable and redeploy on December 2, 2026; archive Lifetime in Polar too.
export const BLACK_FRIDAY_ACTIVE = true;

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
  lifetime: {
    name: "Paperweight Lifetime Pro",
    price: 149,
    cryptoPrice: 139,
    productId: "84eecff9-fce2-4395-bd21-867543559f11",
  },
} as const;

export function checkoutUrl(plan: keyof typeof PLANS) {
  return `${CHECKOUT_URL}?product_id=${PLANS[plan].productId}`;
}

export function getCryptoPayPricing(plan: keyof typeof PLANS = "annual") {
  return {
    priceUsd: PLANS[plan].cryptoPrice,
    planName: PLANS[plan].name,
    duration:
      plan === "annual" ? "1 year" : plan === "cleanup" ? "30 days" : "life",
    renewal:
      plan === "annual"
        ? "One payment for one year. Renew manually by contacting us."
        : plan === "cleanup"
          ? "One payment for 30 days. No subscription or renewal."
          : "One payment for permanent Pro access. No renewal.",
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

export const LIFETIME_OFFER = {
  "@type": "Offer",
  name: PLANS.lifetime.name,
  price: PLANS.lifetime.price,
  priceCurrency: "USD",
  url: checkoutUrl("lifetime"),
  availabilityStarts: "2026-11-16T00:00:00+01:00",
  availabilityEnds: "2026-12-01T23:59:59+01:00",
};

export const CURRENT_OFFERS = [
  ...STANDARD_OFFERS,
  ...(BLACK_FRIDAY_ACTIVE ? [LIFETIME_OFFER] : []),
];
