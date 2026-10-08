import { Check, Search, ShieldCheck, WandSparkles } from "lucide-react";
import { PayWithCryptoButton } from "@/components/PayWithCrypto";
import { SITE_CONFIG } from "@/utils/config";
import {
  checkoutUrl,
  getCryptoPayPricing,
  PLANS,
  STANDARD_OFFERS,
} from "@/utils/pricing";
import { buildMetadata } from "@/utils/seo";

const description =
  "Free gives you the full picture. Pro lets you act on it. Get Paperweight Pro for $60/year or a 30-Day Cleanup Pass for $25.";
export const metadata = buildMetadata({
  title: "Pricing",
  description,
  path: "/pricing",
  imageAlt: "Paperweight pricing",
});

const freeFeatures = [
  "1 email account with full-history sync",
  "Full account and company inventory",
  "Mailing-list overview",
  "Breach and risk overview",
  "Personal-data and privacy overview",
  "Local curation and profile management",
  "Community support on GitHub",
];
const proFeatures = [
  "Everything in Free",
  "Unsubscribe, trash, and mark as spam",
  "Bulk cleanup actions",
  "Send privacy requests and follow-ups",
  "Multiple email accounts",
  "MCP access",
];
const faqItems = [
  {
    question: "What can I do for free?",
    answer:
      "Discover, inspect, and curate your full email history with one account. Free includes your company inventory, mailing lists, breach and risk overview, personal-data findings, and profile management. Pro lets you take cleanup actions, send and follow up on privacy requests, add multiple accounts, and use MCP.",
  },
  {
    question: "Does the Cleanup Pass include all Pro features?",
    answer:
      "Yes. One $25 payment gives you full Pro access for 30 days. There is no subscription or renewal.",
  },
  {
    question: "How does annual Pro billing work?",
    answer:
      "Paperweight Pro costs $60 per year, equivalent to $5 per month, billed yearly through Polar. Crypto costs $55 for one year of the same Pro access, with manual renewal by contacting us.",
  },
  {
    question: "What happens when my access expires?",
    answer:
      "You return to Free. Your local data and profile remain available, and already-connected accounts keep syncing. Cleanup actions, adding another account, and MCP require active Pro access.",
  },
  {
    question: "Can I pay with crypto?",
    answer:
      "Yes. Pay $55 for one year of Pro or $25 for a Cleanup Pass using BTC, ETH, XMR, or ZEC. Use the payment instructions, then send your receipt and plan name by email, Signal, or Telegram. Payments are verified manually and licenses are sent through contact, typically within 24 hours. Crypto payments do not create a recurring subscription.",
  },
  {
    question: "What about Lifetime licenses?",
    answer:
      "Lifetime licenses are currently unavailable. We may offer them again for special occasions. If you already bought a Lifetime license, you keep full Pro access permanently, with no renewal required.",
  },
];

export default function PricingPage() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_CONFIG.NAME,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "macOS, Windows, Linux",
      url: `${SITE_CONFIG.URL}/pricing`,
      description,
      offers: STANDARD_OFFERS,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Static product data only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="container mx-auto px-4 pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="badge badge-soft badge-primary mb-5">Pricing</div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-balance">
            Start for free or clean up with Paperweight Pro
          </h1>
          <p className="text-xl opacity-80">
            Discover, inspect, and curate your digital footprint for free.
            Choose a Cleanup Pass for a fresh start, or Pro to stay on top of it
            all year.
          </p>
        </div>
      </section>
      <section className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-x-8 gap-y-6 max-w-6xl mx-auto">
            <div className="card bg-base-100 border-2 border-base-300 p-8 grid gap-6 lg:row-span-4 lg:grid-rows-subgrid">
              <div className="space-y-3">
                <h2 className="text-2xl font-bold">Free</h2>
                <div className="text-4xl font-bold">$0</div>
                <p className="text-sm opacity-70">
                  Discover, inspect, and curate.
                </p>
              </div>
              <FeatureList features={freeFeatures} />
              <p className="text-sm opacity-70">
                Free forever. Your full email history.
              </p>
              <div className="grid gap-2 content-start">
                <a href="/#download" className="btn btn-soft btn-block">
                  Download free
                </a>
                <p className="min-h-10 flex items-center justify-center text-xs opacity-70">
                  No payment required.
                </p>
              </div>
            </div>
            {(["cleanup", "annual"] as const).map((plan) => (
              <div
                key={plan}
                className={`card bg-base-100 border-2 p-8 grid gap-6 lg:row-span-4 lg:grid-rows-subgrid ${plan === "annual" ? "border-primary" : "border-base-300"}`}
              >
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold">{PLANS[plan].name}</h2>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-4xl font-bold">
                      ${PLANS[plan].price}
                    </span>
                    <span className="text-base">
                      {plan === "annual" ? "/ year" : "/ 30 days"}
                    </span>
                  </div>
                  <p className="text-sm opacity-70">
                    {plan === "annual"
                      ? "Maintain your privacy all year."
                      : "Full Pro for 30 days. No strings attached."}
                  </p>
                </div>
                <FeatureList
                  features={[
                    ...proFeatures,
                    plan === "annual"
                      ? "Email support included"
                      : "Community support on GitHub",
                  ]}
                />
                <p className="text-sm opacity-70">
                  {plan === "annual"
                    ? "Save $5 with crypto. Renew manually."
                    : "One payment. No subscription. No renewal."}
                </p>
                <div className="grid gap-2 content-start">
                  <a
                    href={checkoutUrl(plan)}
                    className="btn btn-primary btn-block"
                    data-umami-event={`Buy ${PLANS[plan].name}`}
                  >
                    {plan === "annual"
                      ? "Get Paperweight Pro"
                      : "Get Cleanup Pass"}
                  </a>
                  <PayWithCryptoButton
                    pricing={getCryptoPayPricing(plan)}
                    className="btn btn-outline btn-block"
                    analyticsEvent={`Pay Crypto ${PLANS[plan].name}`}
                  >
                    Pay with crypto (${PLANS[plan].cryptoPrice})
                  </PayWithCryptoButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Which option fits?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body">
                <Search className="size-8 text-primary" aria-hidden />
                <h3 className="card-title">Free</h3>
                <p>
                  Map your full history. Review companies, mailing lists,
                  breaches, and personal data. Get the full picture before you
                  decide to act.
                </p>
              </div>
            </div>
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body">
                <WandSparkles className="size-8 text-primary" aria-hidden />
                <h3 className="card-title">Cleanup Pass</h3>
                <p>
                  Full Pro for 30 days. Choose it for one focused cleanup, with
                  one payment and no renewal.
                </p>
              </div>
            </div>
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body">
                <ShieldCheck className="size-8 text-primary" aria-hidden />
                <h3 className="card-title">Paperweight Pro</h3>
                <p>
                  Keep full access all year for ongoing cleanup, privacy-request
                  tracking, multiple accounts, and MCP. Email support is
                  included.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-base-200 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4 text-center">
            What Pro unlocks
          </h2>
          <p className="text-center opacity-80 mb-8">
            Both paid plans give you the tools to act on what you find.
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {[
              "Unsubscribe, trash, spam, and privacy requests",
              "Bulk cleanup actions",
              "Multiple email accounts",
              "MCP access",
              "Ongoing privacy-request tracking",
              "Email support with yearly Pro",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="size-5 shrink-0 text-success" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm opacity-70 mt-6 text-center">
            Free and Cleanup Pass include community support on{" "}
            <a href={`${SITE_CONFIG.GITHUB_URL}/issues`} className="link">
              GitHub
            </a>
            .
          </p>
        </div>
      </section>
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">Pricing FAQ</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="collapse collapse-arrow bg-base-200 border border-base-300"
              >
                <summary className="collapse-title font-semibold">
                  {item.question}
                </summary>
                <div className="collapse-content text-sm opacity-80">
                  <p>{item.answer}</p>
                </div>
              </details>
            ))}
          </div>
          <p className="text-sm opacity-70 mt-8">
            Prices are in USD. Polar processes card payments. Paperweight does
            not store payment information. Crypto payments are handled manually.
          </p>
        </div>
      </section>
    </>
  );
}

interface FeatureListProps {
  features: string[];
}
function FeatureList({ features }: FeatureListProps) {
  return (
    <ul className="space-y-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2">
          <Check className="size-5 shrink-0 text-success" aria-hidden />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}
