import { Check, Coins, Download, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { PayWithCryptoButton } from "@/components/PayWithCrypto";
import { SITE_CONFIG } from "@/utils/config";
import {
  getCryptoPayPricing,
  getCryptoPrice,
  LICENSE_PRICING,
} from "@/utils/pricing";
import { buildMetadata } from "@/utils/seo";

const title = "Pricing";
const description =
  "Use Paperweight free with one email account and 90 days of history, or buy a perpetual license for unlimited available history and multiple accounts.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/pricing",
  imageAlt: "Paperweight pricing",
});

const faqItems = [
  {
    question: "Is the free version a 90-day trial?",
    answer:
      "No. The free version does not expire. It works with one email account and scans the most recent 90 days of email history.",
  },
  {
    question: "What does a perpetual license mean?",
    answer:
      "You can use the licensed version you bought permanently. The license includes updates through the first major release, v1. A future major version can require a new license.",
  },
  {
    question: "Which features are available for free?",
    answer:
      "The free version includes account mapping, mailing-list cleanup and unsubscribe actions, breach information, and personal-data request templates. Its limits are one email account and 90 days of email history.",
  },
  {
    question: "What support comes with a license?",
    answer:
      "A license includes one year of email support. Community support remains available for the free version.",
  },
  {
    question: "How can I pay?",
    answer:
      "You can use the Polar checkout or pay with supported cryptocurrencies. The crypto flow supports Ethereum and stablecoins, Bitcoin, Zcash, Monero, and more cross-chain options through Fluidkey.",
  },
] as const;

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_CONFIG.URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Pricing",
        item: `${SITE_CONFIG.URL}/pricing`,
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_CONFIG.NAME,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "macOS, Windows, Linux",
    url: `${SITE_CONFIG.URL}/pricing`,
    description,
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: 0,
        priceCurrency: "USD",
        url: `${SITE_CONFIG.URL}/#download`,
      },
      {
        "@type": "Offer",
        name: "Perpetual license via Polar",
        price: LICENSE_PRICING.LICENSE_PRICE,
        priceCurrency: "USD",
        url: SITE_CONFIG.LICENSE_URL,
      },
      {
        "@type": "Offer",
        name: "Perpetual license paid with crypto",
        price: getCryptoPrice(),
        priceCurrency: "USD",
        url: `${SITE_CONFIG.URL}/pricing`,
      },
    ],
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

const sharedFeatures = [
  "Account and company mapping",
  "Mailing-list cleanup and unsubscribe actions",
  "Breach information",
  "Personal-data request templates",
  "Local processing on your computer",
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from static constants in this module.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="container mx-auto px-4 pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="badge badge-soft badge-primary mb-5">Pricing</div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Start free or buy once
          </h1>
          <p className="text-xl opacity-80">
            The free version does not expire. Buy a perpetual license when you
            need more than one email account or more than 90 days of email
            history.
          </p>
        </div>
      </section>

      <section className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
            <div className="card bg-base-100 border-2 border-base-300">
              <div className="card-body p-8">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold mb-2">Free</h2>
                  <div className="text-4xl font-bold mb-2">$0</div>
                  <p className="text-sm opacity-70">No expiry</p>
                </div>
                <ul className="space-y-3 flex-1 mb-6">
                  {sharedFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        className="size-5 shrink-0 text-success"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <strong>One email account</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <strong>Most recent 90 days of email history</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>Community support</span>
                  </li>
                </ul>
                <a href="/#download" className="btn btn-soft btn-block">
                  Download free
                </a>
              </div>
            </div>

            <div className="card bg-base-100 border-2 border-primary">
              <div className="card-body p-8">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold mb-2">Perpetual license</h2>
                  <div className="text-4xl font-bold mb-2">
                    ${LICENSE_PRICING.LICENSE_PRICE}
                  </div>
                  <p className="text-sm opacity-70">One-time payment</p>
                </div>
                <ul className="space-y-3 flex-1 mb-6">
                  {sharedFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        className="size-5 shrink-0 text-success"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <strong>Multiple email accounts</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <strong>Unlimited available email history</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>Permanent use of the licensed version</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>
                      Updates through v1 and one year of email support
                    </span>
                  </li>
                </ul>
                <a
                  href={SITE_CONFIG.LICENSE_URL}
                  className="btn btn-primary btn-block plausible-event-name=Buy+License"
                >
                  Buy a license
                </a>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-300 max-w-4xl mx-auto mt-6">
            <div className="card-body flex flex-col gap-3 py-4 px-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Coins
                  className="size-5 shrink-0 opacity-70 mx-2"
                  aria-hidden
                />
                <div>
                  <h2 className="text-lg font-medium">Pay with crypto</h2>
                  <p className="text-sm opacity-70 mt-2">
                    Ethereum and stablecoins, Bitcoin, Zcash, Monero, and more
                    cross-chain options through Fluidkey.
                  </p>
                </div>
              </div>
              <PayWithCryptoButton
                pricing={getCryptoPayPricing()}
                className="btn btn-outline btn-accent btn-sm shrink-0 sm:ml-4 plausible-event-name=Pay+Crypto"
              >
                Pay with crypto (${getCryptoPrice()})
              </PayWithCryptoButton>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 className="text-3xl font-bold mb-3">Which option fits?</h2>
              <p className="text-lg opacity-80">
                You can use the free version before you decide to pay.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card bg-base-200 border border-base-300">
                <div className="card-body">
                  <Download className="size-8 text-primary" aria-hidden />
                  <h3 className="card-title">Choose free</h3>
                  <p className="opacity-80">
                    Use one mailbox and review recent email without a
                    time-limited trial. Keep using it free if that covers your
                    cleanup.
                  </p>
                </div>
              </div>
              <div className="card bg-base-200 border border-base-300">
                <div className="card-body">
                  <RefreshCw className="size-8 text-primary" aria-hidden />
                  <h3 className="card-title">Buy a license</h3>
                  <p className="opacity-80">
                    Pay once when you need older available history or more than
                    one mailbox. There is no recurring subscription.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-3">
                What your payment covers
              </h2>
              <p className="text-lg opacity-80">
                The license supports development of the open-source app and
                unlocks the paid limits in ready-made builds.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                  <RefreshCw className="size-7 text-info" aria-hidden />
                  <h3 className="font-semibold">Update entitlement</h3>
                  <p className="text-sm opacity-80">
                    Updates through the first major release, v1. Future major
                    versions can require a new license.
                  </p>
                </div>
              </div>
              <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                  <Mail className="size-7 text-info" aria-hidden />
                  <h3 className="font-semibold">Support entitlement</h3>
                  <p className="text-sm opacity-80">
                    One year of email support is included with the license.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm opacity-70 mt-6 text-center">
              Polar processes the standard checkout. Paperweight does not store
              your payment information. Crypto licenses are sent after payment
              confirmation.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
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
          </div>
        </div>
      </section>

      <section className="bg-base-300 py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">
              Review your email history
            </h2>
            <p className="text-lg opacity-80 mb-8">
              Download the free version or buy once for multiple accounts and
              unlimited available history.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={SITE_CONFIG.LICENSE_URL}
                className="btn btn-primary plausible-event-name=Buy+License"
              >
                Buy a license
              </a>
              <Link href="/#download" className="btn btn-soft">
                Download free
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
