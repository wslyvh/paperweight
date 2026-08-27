import { FileText, MapIcon } from "lucide-react";
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

const title = "Email Cleanup and Bulk Unsubscribe";
const description =
  "Find active mailing lists and perform genuine unsubscribe actions directly from your desktop. Paperweight processes everything locally on your computer.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/email-cleanup",
  imageAlt: "Paperweight mailing lists and bulk unsubscribe view",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Find mailing lists",
    description:
      "Identify newsletters and promotional senders that include a usable unsubscribe method.",
  },
  {
    title: "Compare sender activity",
    description:
      "Compare message counts and latest activity so recurring sources of inbox noise are easy to spot.",
  },
  {
    title: "Confirm unsubscriptions",
    description:
      "Choose legitimate senders you recognize and send supported one-click or email unsubscribe requests.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "How does Paperweight unsubscribe from senders?",
    answer:
      "Paperweight uses standard RFC 8058 one-click headers, automated unsubscribe mailto triggers, or direct sender links. It performs real unsubscriptions rather than simply hiding or archiving emails behind client-side rules.",
  },
  {
    question: "Is it safe to unsubscribe from spam?",
    answer:
      "Unsubscribe only from legitimate senders and services you recognize. For spam or suspicious emails, use your provider's spam reporting tool instead of clicking links or sending confirmation emails.",
  },
  {
    question: "Does Paperweight create inbox filter rules?",
    answer:
      "No. Paperweight triggers real unsubscribe requests with the sender, meaning you stop receiving messages at the source rather than filling your spam/trash filters.",
  },
  {
    question: "Can I manage subscriptions across multiple accounts?",
    answer:
      "Yes. With a lifetime license, you can connect multiple Gmail, Outlook, Proton Bridge, or IMAP inboxes and triage mailing lists across all of them.",
  },
  {
    question: "Does Paperweight upload or share my email data?",
    answer:
      "No. All message analysis and unsubscribe actions are initiated directly from your device. No email content or credentials ever reach Paperweight servers.",
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
        name: "Email cleanup",
        item: `${SITE_CONFIG.URL}/email-cleanup`,
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

export default function EmailCleanupPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from static constants in this module.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FeatureHero
        eyebrow="Email cleanup"
        title="Unsubscribe from unwanted emails in bulk"
        description="Find active mailing lists, compare which senders create the most noise, and stop recurring email at the source."
        imageSrc="/features/mailing.png"
        imageAlt="Paperweight mailing lists dashboard showing senders and unsubscribe options"
        imageWidth={1024}
        imageHeight={1002}
      />

      <FeatureWorkflow
        heading="How email cleanup works"
        description="Paperweight separates actionable mailing lists from the rest of your mail, then lets you review and unsubscribe in one place."
        steps={workflowSteps}
      />

      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-3">
              Stop unwanted email at the source
            </h2>
            <p className="text-lg opacity-80">
              Inbox rules only hide recurring mail. Paperweight helps you leave
              legitimate mailing lists so new messages stop being sent.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">
                  Prioritize the biggest senders
                </h3>
                <p className="text-sm opacity-80">
                  Use message volume and recent activity to start with the
                  mailing lists having the greatest impact on your inbox.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">
                  Keep what you still value
                </h3>
                <p className="text-sm opacity-80">
                  Review each sender before acting so useful newsletters,
                  receipts, and account updates remain untouched.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title text-lg">Unsubscribe for real</h3>
                <p className="text-sm opacity-80">
                  Use standards-based one-click or email unsubscribe methods
                  instead of creating filters that only hide future messages.
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
            title: "Find old accounts",
            description:
              "Discover forgotten logins, services, and companies holding your email address from years of past messages.",
            href: "/account-discovery",
            icon: <MapIcon className="w-12 h-12 text-info" strokeWidth={1.5} />,
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
        heading="Clean up unwanted subscriptions"
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
