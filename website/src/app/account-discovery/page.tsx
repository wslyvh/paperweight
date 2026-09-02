import { FileText, Mail } from "lucide-react";
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
import { ORGANIZATION_SCHEMA, SITE_CONFIG } from "@/utils/config";
import { buildMetadata } from "@/utils/seo";

const title = "Find Accounts Linked to Your Email";
const description =
  "Every account you create and every online purchase is connected to your email address. Paperweight maps your forgotten accounts locally on your computer.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/account-discovery",
  imageAlt: "Paperweight account discovery company detail view",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Connect your inbox",
    description:
      "Connect Gmail, Outlook, Proton Mail via Bridge, or any standard IMAP mailbox directly in the app.",
  },
  {
    title: "Find evidence of past accounts",
    description:
      "Welcome messages, receipts, password resets, and security alerts reveal services you have used, even when you no longer remember them.",
  },
  {
    title: "Review each company",
    description:
      "See first and last contact, message counts, account evidence, detected personal data, and known breach history in one place.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How does account discovery work?",
    answer:
      "Paperweight connects directly to your email provider and analyzes your message history on your device. It identifies sign-up confirmations, order receipts, and password resets to reconstruct an inventory of services you have used.",
  },
  {
    question: "What if I deleted my old welcome emails?",
    answer:
      "Paperweight searches for password resets, order updates, invoices, and security alerts in addition to sign-up emails. If all messages from a company were permanently deleted, it cannot be discovered.",
  },
  {
    question: "Does finding an account mean it is still active?",
    answer:
      "No. Paperweight discovers historical relationships based on emails in your inbox. It gives you the evidence you need to decide whether to log in, close the account, or request deletion.",
  },
  {
    question: "Can I delete accounts directly from Paperweight?",
    answer:
      "Paperweight generates pre-filled GDPR and CCPA deletion request emails with your account evidence attached, allowing you to send official deletion requests with a single click.",
  },
  {
    question: "Which email providers are supported?",
    answer:
      "Paperweight supports Gmail, Outlook, Proton Mail via Proton Bridge, and any standard IMAP provider.",
  },
  {
    question: "Does Paperweight upload or store my emails?",
    answer:
      "No. All analysis and database storage remain 100% local on your computer. Your credentials and messages never touch Paperweight servers.",
  },
];

const structuredData = [
  ORGANIZATION_SCHEMA,
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
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How Paperweight finds old accounts",
    description:
      "Paperweight turns your email history into a company-by-company inventory of accounts.",
    step: workflowSteps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.title,
      text: step.description,
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
        description="Every service you sign up for and every online purchase is connected to your email address. Most people have over 100 forgotten accounts, creating unnecessary security risks and privacy exposure."
        imageSrc="/features/accounts-detail.png"
        imageAlt="Paperweight company detail with first and last activity, email count, senders, and evidence"
        imageWidth={1024}
        imageHeight={1002}
      />

      <FeatureWorkflow
        heading="How Paperweight finds old accounts"
        description="Your inbox already contains evidence of the shops, apps, and services you have used. Paperweight turns that history into a company-by-company inventory."
        steps={workflowSteps}
      />

      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-3">
              Why forgotten accounts matter
            </h2>
            <p className="text-lg opacity-80">
              An account can outlive the reason you created it. Old services may
              still retain your contact details, purchase history, or other
              personal information.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Find what memory misses</h3>
                <p className="text-sm opacity-80">
                  Recover one-off purchases, old subscriptions, and services
                  that would be difficult to inventory manually.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">
                  Prioritize potential risk
                </h3>
                <p className="text-sm opacity-80">
                  See which relationships are inactive, which companies appear
                  in known breach records, and where personal details appear in
                  messages.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Take informed action</h3>
                <p className="text-sm opacity-80">
                  Use the evidence to decide what to keep, unsubscribe from, or
                  follow up with an access or deletion request.
                </p>
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
            title: "Bulk unsubscribe",
            description:
              "Compare active mailing lists, identify the senders creating the most noise, and unsubscribe at the source.",
            href: "/email-cleanup",
            icon: <Mail className="w-12 h-12 text-primary" strokeWidth={1.5} />,
          },
          {
            title: "Remove personal data",
            description:
              "Detect exposed personal data, phone numbers, addresses, payment info, and send targeted deletion requests.",
            href: "/remove-personal-data",
            icon: (
              <FileText className="w-12 h-12 text-warning" strokeWidth={1.5} />
            ),
          },
        ]}
      />

      <FeatureFinalCta
        heading="Build your account inventory"
        body="Try Paperweight free with one email account and 90 days of history. Upgrade anytime for unlimited history and multi-account support."
        primaryAction={{
          href: SITE_CONFIG.LICENSE_URL,
          label: "Buy Lifetime License",
          className: "btn btn-primary plausible-event-name=Buy+License",
        }}
        secondaryAction={{
          href: "/#download",
          label: "Download for free",
          className: "btn btn-soft",
        }}
      />
    </>
  );
}
