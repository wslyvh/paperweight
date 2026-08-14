import {
  Fingerprint,
  ListFilter,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  type FaqItem,
  FeatureFaq,
  FeatureFinalCta,
  FeatureHero,
  FeatureTrustSummary,
  FeatureWorkflow,
  RelatedFeatures,
  type WorkflowStep,
} from "@/components/FeaturePage";
import { SITE_CONFIG } from "@/utils/config";
import { buildMetadata } from "@/utils/seo";

const title = "Remove Personal Data From Companies";
const description =
  "Detect personal data in your email, see which companies it appears with, and prepare deletion requests on your device with Paperweight.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/remove-personal-data",
  imageAlt: "Paperweight desktop app dashboard",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Detect and classify evidence",
    description:
      "Paperweight looks for structured personal data in available email and classifies each message on your computer.",
  },
  {
    title: "Review findings by company",
    description:
      "Check the detected value, confidence, message evidence, and company. Mark each finding as It’s mine or Not mine.",
  },
  {
    title: "Prepare a deletion request",
    description:
      "Choose a company, prepare a request, and review the recipient and message before you send it.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How does Paperweight find companies that may have my data?",
    answer:
      "Paperweight analyzes available email on your computer. It detects structured personal data, classifies messages, and groups findings and source evidence by company.",
  },
  {
    question: "Does unsubscribing delete my personal data?",
    answer:
      "No. Unsubscribe stops a legitimate mailing-list relationship. It does not delete an account, old messages, or personal data that a company stores.",
  },
  {
    question: "Can Paperweight delete all my old accounts at once?",
    answer:
      "No. You review each company and prepare a deletion request when it fits. The company decides how it handles the request under the rules that apply to you.",
  },
  {
    question: "Does Paperweight remove data from data brokers?",
    answer:
      "No. Paperweight works with companies and personal-data evidence found in your email. It does not remove broker records or public search results.",
  },
  {
    question: "Can a company refuse to delete my data?",
    answer:
      "A company can keep some data when it has a valid legal reason. Your rights and the response rules depend on your location. Paperweight helps you prepare a request, but it does not give legal advice or guarantee deletion.",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_CONFIG.URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Personal data removal",
        item: `${SITE_CONFIG.URL}/remove-personal-data`,
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

const dataTypes = [
  "Email addresses",
  "Phone numbers",
  "Postal addresses and postcodes",
  "Payment card numbers",
  "IBANs",
  "National identifiers",
];

const messageTypes = ["Personal", "Purchase", "Update", "Promotion", "Social"];

export default function RemovePersonalDataPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from static constants in this module.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FeatureHero
        eyebrow="Personal data removal"
        title="Find companies that may have your data. Ask them to delete it."
        description="Paperweight detects structured personal data in available email, groups the evidence by company, and helps you prepare a deletion request. Analysis runs locally in the desktop app."
        imageSrc="/dashboard.png"
        imageAlt="Paperweight desktop dashboard showing companies found in available email history"
        imageWidth={1057}
        imageHeight={880}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <Fingerprint
                className="w-10 h-10 text-primary mb-4"
                strokeWidth={1.5}
              />
              <h2 className="text-3xl font-bold mb-4">
                Find personal-data evidence before you send requests
              </h2>
              <p className="text-lg opacity-80">
                Old receipts, account updates, and service messages can contain
                details that identify you. Paperweight finds structured values
                and connects each finding to its company and source message.
              </p>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title">Know what this feature covers</h3>
                <p className="text-sm opacity-80">
                  Paperweight helps with personal data and companies found in
                  your email. It does not scrub data brokers or remove public
                  search results.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureWorkflow
        heading="How personal data review works"
        steps={workflowSteps}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 className="text-3xl font-bold mb-3">
                Detect structured personal data locally
              </h2>
              <p className="text-lg opacity-80">
                Detection runs on your computer before you decide which findings
                belong to you and which companies need review.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                  <SearchCheck
                    className="w-9 h-9 text-info"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title mt-2">Structured data types</h3>
                  <ul className="grid gap-2 text-sm opacity-80 sm:grid-cols-2">
                    {dataTypes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                  <ListFilter
                    className="w-9 h-9 text-secondary"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title mt-2">Message classification</h3>
                  <p className="text-sm opacity-80">
                    Paperweight classifies messages so that you can understand
                    the context around a detected value.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {messageTypes.map((item) => (
                      <span key={item} className="badge badge-soft">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-base-100 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 className="text-3xl font-bold mb-3">
                Review evidence before you act
              </h2>
              <p className="text-lg opacity-80">
                Findings include a company, source-message evidence, and a
                confidence level. You stay in control of every decision.
              </p>
            </div>
            <figure className="max-w-4xl mx-auto overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl">
              <a
                href="/account-company-detail.png"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open full-size company-detail screenshot"
              >
                <Image
                  src="/account-company-detail.png"
                  alt="Paperweight company detail with activity, risk information, email evidence, and available actions"
                  width={2048}
                  height={1856}
                  className="w-full h-auto"
                />
              </a>
              <figcaption className="p-4 text-sm opacity-70">
                Company detail connects activity and source-email evidence to
                the actions available in Paperweight.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <FeatureTrustSummary />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-4 items-start mb-8">
              <ShieldAlert
                className="w-8 h-8 shrink-0 text-warning"
                strokeWidth={1.5}
              />
              <div>
                <h2 className="text-3xl font-bold mb-3">
                  What findings and requests mean
                </h2>
                <p className="text-lg opacity-80">
                  Use each finding as evidence to review, not proof that a
                  company still stores the same value.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                "Detection covers supported structured patterns in available email. Review each result and use It’s mine or Not mine to correct it.",
                "A deletion request does not guarantee deletion. A company can keep data when it has a valid legal reason.",
                "Rights and response rules depend on your location. Paperweight helps prepare a request and does not give legal advice.",
                "Paperweight does not delete accounts automatically, remove broker records, or remove public search results.",
              ].map((item) => (
                <p
                  key={item}
                  className="rounded-lg bg-base-100 border border-base-300 p-4 text-sm opacity-80"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <RelatedFeatures
        heading="Continue your privacy cleanup"
        items={[
          {
            title: "Account discovery",
            description:
              "Find companies and old services in your email history.",
            href: "/account-discovery",
          },
          {
            title: "Email cleanup",
            description: "Find mailing lists and stop unwanted subscriptions.",
            href: "/email-cleanup",
          },
          {
            title: "Personal data removal",
            description: "Find personal data and prepare deletion requests.",
          },
        ]}
      />

      <FeatureFaq items={faqItems} />

      <section className="bg-base-300 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-3">
            <Link
              href="/resources/gdpr-generator"
              className="card bg-base-100 border border-base-300 hover:bg-base-200 transition-colors"
            >
              <div className="card-body">
                <h2 className="card-title text-lg">One known company</h2>
                <p className="text-sm opacity-80">
                  Prepare a request with the free GDPR generator.
                </p>
              </div>
            </Link>
            <Link
              href="/guides/how-to-exercise-your-gdpr-rights"
              className="card bg-base-100 border border-base-300 hover:bg-base-200 transition-colors"
            >
              <div className="card-body">
                <h2 className="card-title text-lg">Understand your rights</h2>
                <p className="text-sm opacity-80">
                  Read how GDPR requests, identity checks, and replies work.
                </p>
              </div>
            </Link>
            <Link
              href="/guides/data-removal-services-compared"
              className="card bg-base-100 border border-base-300 hover:bg-base-200 transition-colors"
            >
              <div className="card-body">
                <h2 className="card-title text-lg">Compare removal services</h2>
                <p className="text-sm opacity-80">
                  Compare services made for broker-removal work.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <FeatureFinalCta
        heading="Review the companies that may have your data"
        body="Try Paperweight free with one email account and 90 days of history. Buy a perpetual license for unlimited available history and multiple accounts."
        primaryAction={{
          href: SITE_CONFIG.LICENSE_URL,
          label: "Buy a license",
          className: "btn btn-primary plausible-event-name=Buy+License",
        }}
        secondaryAction={{
          href: "/#download",
          label: "Download Paperweight",
          className: "btn btn-soft",
        }}
      />
    </>
  );
}
