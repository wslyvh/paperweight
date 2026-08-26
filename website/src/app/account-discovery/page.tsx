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
  "Uncover online accounts and forgotten services directly from your past emails. Paperweight processes everything locally on your computer.";

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
    title: "Map account signals",
    description:
      "Paperweight scans welcome emails, password resets, and service receipts locally to map your accounts.",
  },
  {
    title: "Review company footprints",
    description:
      "Inspect activity dates, message counts, breach alerts, and company risk profiles in one unified view.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How does account discovery work?",
    answer:
      "Paperweight connects directly to your email provider and analyzes your message history on your device. It identifies sign-up confirmations, order receipts, and password resets to reconstruct an inventory of services you have used.",
  },
  {
    question: "Can Paperweight find every account I ever made?",
    answer:
      "Paperweight detects accounts with evidence in your available email history. Accounts where emails were permanently deleted or services registered without email confirmation will not appear.",
  },
  {
    question: "Does Paperweight upload or store my emails?",
    answer:
      "No. All analysis and database storage remain 100% local on your computer. Your credentials and messages never touch Paperweight servers.",
  },
  {
    question: "Which email providers are supported?",
    answer:
      "Paperweight supports Gmail, Outlook, Proton Mail via Proton Bridge, and any email service supporting IMAP.",
  },
  {
    question: "What actions can I take after finding an account?",
    answer:
      "You can inspect message evidence, unsubscribe from associated mailing lists, or generate GDPR and CCPA deletion requests directly from the app.",
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
        description="Turn your email history into a clear inventory of online accounts, active subscriptions, and forgotten services."
        imageSrc="/features/accounts-detail.png"
        imageAlt="Paperweight company detail with first and last activity, email count, senders, and evidence"
        imageWidth={1052}
        imageHeight={1068}
      />

      <FeatureWorkflow
        heading="How account discovery works"
        steps={workflowSteps}
      />

      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-3">
              Clear signals for every online account
            </h2>
            <p className="text-lg opacity-80">
              See when you first signed up, when you last heard from them, and
              whether the company was involved in known security breaches.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Relationship timeline</h3>
                <p className="text-sm opacity-80">
                  Track your first and last recorded activity to quickly spot
                  abandoned accounts you haven't used in years.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Direct email evidence</h3>
                <p className="text-sm opacity-80">
                  Inspect the actual message subjects and senders backing each
                  account detection before taking any action.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Breach exposure</h3>
                <p className="text-sm opacity-80">
                  Cross-reference detected companies against known data breaches
                  to prioritize which old accounts to close first.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureTrustSummary />

      <FeatureFaq items={faqItems} />

      <RelatedFeatures
        heading="Explore other privacy tools"
        items={[
          {
            title: "Email cleanup",
            description:
              "Clean up active mailing lists and bulk unsubscribe with real native methods.",
            href: "/email-cleanup",
          },
          {
            title: "Personal data removal",
            description:
              "Detect exposed personal data and prepare targeted deletion requests.",
            href: "/remove-personal-data",
          },
        ]}
      />

      <FeatureFinalCta
        heading="Build your account inventory"
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
