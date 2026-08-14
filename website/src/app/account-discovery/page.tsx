import { AlertTriangle, MailSearch } from "lucide-react";
import Image from "next/image";
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

const title = "Find Accounts Linked to Your Email";
const description =
  "Find companies, old accounts, and forgotten services from your email history. Paperweight processes email locally on your computer.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/account-discovery",
  imageAlt: "Paperweight desktop app dashboard",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Add your email account",
    description:
      "Connect Gmail or Outlook, or use Proton Bridge or another IMAP provider in the desktop app.",
  },
  {
    title: "Analyze available history",
    description:
      "Paperweight reads account, order, security, and service messages on your computer and groups them by company.",
  },
  {
    title: "Review your companies",
    description:
      "Check activity dates, message evidence, account signals, risk levels, and supported breach information.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How do I find accounts linked to my email?",
    answer:
      "Connect your email account in the Paperweight desktop app. Paperweight analyzes available messages on your computer and groups account, order, security, and service evidence into a company inventory.",
  },
  {
    question: "Can Paperweight find every account I have created?",
    answer:
      "No. Paperweight finds evidence in email that it can access. It cannot find deleted or missing messages, and a result does not confirm that an account is still active.",
  },
  {
    question: "Does Paperweight upload or store my emails?",
    answer:
      "Paperweight processes email on your computer and stores its local database there. It does not upload your email data to Paperweight servers.",
  },
  {
    question: "Which email providers does Paperweight support?",
    answer:
      "Paperweight supports Gmail, Outlook, Proton Mail through Proton Bridge, and other providers that offer IMAP access.",
  },
  {
    question: "What can I do after I find an old account?",
    answer:
      "Review the supporting messages first. You can then keep the company, remove related email, unsubscribe from a legitimate mailing list, or prepare a personal-data request when that action fits.",
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
        name: "Account discovery",
        item: `${SITE_CONFIG.URL}/account-discovery`,
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

export default function AccountDiscoveryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from static constants in this module.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FeatureHero
        eyebrow="Account discovery"
        title="Find accounts linked to your email"
        description="Paperweight turns available email history into an inventory of companies, old accounts, and forgotten services. The desktop app processes email locally on your computer."
        imageSrc="/dashboard.png"
        imageAlt="Paperweight dashboard with account, mailing list, and message totals"
        imageWidth={1057}
        imageHeight={880}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <MailSearch
                className="w-10 h-10 text-primary mb-4"
                strokeWidth={1.5}
              />
              <h2 className="text-3xl font-bold mb-4">
                Turn available email history into an account inventory
              </h2>
              <p className="text-lg opacity-80">
                Password resets, receipts, security alerts, and service updates
                can show which companies you have used. Paperweight groups that
                evidence by company so you can review your digital footprint in
                one place.
              </p>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title">See useful account signals</h3>
                <ul className="space-y-3 text-sm opacity-80">
                  <li>Company name and first and last activity</li>
                  <li>Account, order, and message evidence</li>
                  <li>Risk level and breach signals when supported</li>
                  <li>
                    Filters for old, inactive, high-risk, and breached companies
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureWorkflow
        heading="How account discovery works"
        steps={workflowSteps}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 className="text-3xl font-bold mb-3">
                Review the evidence behind each company
              </h2>
              <p className="text-lg opacity-80">
                Use dates, message counts, senders, risk information, and
                supporting email to decide what to review next.
              </p>
            </div>
            <div className="max-w-4xl mx-auto">
              <figure className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl">
                <a
                  href="/account-company-detail.png"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open full-size company-detail screenshot"
                >
                  <Image
                    src="/account-company-detail.png"
                    alt="Paperweight company detail with first and last activity, email count, senders, risk profile, and evidence"
                    width={2048}
                    height={1856}
                    className="w-full h-auto"
                  />
                </a>
                <figcaption className="p-4 text-sm opacity-70">
                  Company detail shows activity, evidence, and available
                  actions.
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      <FeatureTrustSummary />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-4 items-start mb-8">
              <AlertTriangle
                className="w-8 h-8 shrink-0 text-warning"
                strokeWidth={1.5}
              />
              <div>
                <h2 className="text-3xl font-bold mb-3">
                  What the results mean
                </h2>
                <p className="text-lg opacity-80">
                  Paperweight finds company and account evidence in the email
                  history that your provider makes available.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                "A result shows evidence of a relationship. It does not confirm that the account is still active.",
                "Deleted or missing email is outside the available history and cannot appear in the inventory.",
                "Paperweight searches your available email history. It does not find another person's accounts.",
                "Paperweight uses email evidence. It is not a reverse email lookup or people-search service.",
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
          },
          {
            title: "Email cleanup",
            description: "Find mailing lists and stop unwanted subscriptions.",
            href: "/email-cleanup",
          },
          {
            title: "Personal data removal",
            description: "Find personal data and prepare deletion requests.",
            href: "/remove-personal-data",
          },
        ]}
      />

      <FeatureFaq items={faqItems} />
      <FeatureFinalCta
        heading="Build your account inventory"
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
