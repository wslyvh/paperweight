import { ListFilter, Mail, MapIcon, SearchCheck } from "lucide-react";
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

const title = "Remove Personal Data from Companies";
const description =
  "Detect exposed personal data in past emails, review findings by company, and prepare verified deletion requests directly on your computer.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/remove-personal-data",
  imageAlt: "Paperweight personal data detection and review dashboard",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Detect exposed PII",
    description:
      "Paperweight scans available emails on your device for addresses, phone numbers, cards, and identifiers.",
  },
  {
    title: "Review findings by company",
    description:
      "Inspect detected values, confidence scores, and source messages. Confirm what is yours with a single click.",
  },
  {
    title: "Prepare deletion requests",
    description:
      "Generate pre-filled GDPR or CCPA deletion emails with your specific account evidence attached.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How does Paperweight find exposed personal data?",
    answer:
      "Paperweight scans your message history locally using pattern recognition to detect phone numbers, postal addresses, payment cards, and identifiers, grouping every finding under the company that received it.",
  },
  {
    question: "Does unsubscribing delete my personal data?",
    answer:
      "No. Unsubscribing only stops marketing emails. To remove account records, stored personal data, and transaction histories, you must submit a formal data deletion request.",
  },
  {
    question: "Does Paperweight remove records from data brokers?",
    answer:
      "No. Paperweight focuses on first-party relationships found in your actual inbox. For public broker listings, manual removal or dedicated broker scrubbers are the appropriate tool.",
  },
  {
    question: "Can a company refuse a deletion request?",
    answer:
      "Under regulations like GDPR and CCPA, companies must delete personal data unless they have a legal requirement to retain it (such as tax records or active dispute resolution).",
  },
  {
    question: "Does Paperweight send emails automatically?",
    answer:
      "No. Every deletion request is drafted for your review first. You inspect the recipient, template, and included evidence before sending it from your own email client.",
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
  "Postal addresses",
  "Payment cards",
  "IBANs",
  "National IDs",
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
        title="Find personal data in your email and request deletion"
        description="Detect exposed phone numbers, addresses, and payment details across past emails, then prepare verified deletion requests on your machine."
        imageSrc="/features/personal-data.png"
        imageAlt="Paperweight personal data detection view showing detected PII and confidence levels"
        imageWidth={1024}
        imageHeight={1002}
      />

      <FeatureWorkflow
        heading="How personal data review works"
        steps={workflowSteps}
      />

      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-3">
              Detect and review structured data locally
            </h2>
            <p className="text-lg opacity-80">
              Identify what sensitive information companies have collected from
              you over years of orders, updates, and account activity.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <SearchCheck
                  className="w-9 h-9 text-info mb-2"
                  strokeWidth={1.5}
                />
                <h3 className="card-title text-lg">Supported data types</h3>
                <p className="text-sm opacity-80 mb-3">
                  Pattern matching identifies structured personal data stored
                  across receipts and messages:
                </p>
                <div className="flex flex-wrap gap-2">
                  {dataTypes.map((item) => (
                    <span key={item} className="badge badge-soft">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <ListFilter
                  className="w-9 h-9 text-secondary mb-2"
                  strokeWidth={1.5}
                />
                <h3 className="card-title text-lg">Context classification</h3>
                <p className="text-sm opacity-80 mb-3">
                  Messages are categorized so you understand the context
                  surrounding each detected value:
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
      </section>

      <FeatureTrustSummary />

      <FeatureFaq items={faqItems} />

      <RelatedFeatures
        heading="Explore other features"
        description="Choose the part of your email history that you want to explore or clean up."
        items={[
          {
            title: "Find old accounts",
            description:
              "Discover forgotten logins, services, and companies holding your email address from years of past messages.",
            href: "/account-discovery",
            icon: <MapIcon className="w-12 h-12 text-info" strokeWidth={1.5} />,
          },
          {
            title: "Bulk unsubscribe",
            description:
              "Clean up noisy newsletters and marketing lists with real one-click unsubscriptions straight from your device.",
            href: "/email-cleanup",
            icon: <Mail className="w-12 h-12 text-primary" strokeWidth={1.5} />,
          },
        ]}
      />

      <FeatureFinalCta
        heading="Review your personal data footprint"
        body="Try Paperweight free with one email account and 90 days of history. Upgrade anytime for unlimited history and multi-account support."
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
