import {
  AlertTriangle,
  CheckCircle2,
  MailCheck,
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

const title = "Email Cleanup App With Real Unsubscribe";
const description =
  "Find mailing lists and perform real unsubscribe actions on your computer. Paperweight supports Gmail, Outlook, Proton Bridge, and IMAP.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/email-cleanup",
  imageAlt: "Paperweight desktop app dashboard with mailing-list totals",
});

const workflowSteps: WorkflowStep[] = [
  {
    title: "Find mailing lists",
    description:
      "Paperweight groups mailing lists and senders from the email history available to the desktop app.",
  },
  {
    title: "Review each sender",
    description:
      "Check the sender, message count, recent activity, and available unsubscribe method before you act.",
  },
  {
    title: "Confirm the action",
    description:
      "Select legitimate senders and confirm each unsubscribe action. Paperweight records the result in your local activity history.",
  },
];

const faqItems: FaqItem[] = [
  {
    question: "Is an email unsubscribe app safe?",
    answer:
      "Use unsubscribe only for a sender that you recognize. Do not click a link or reply to an unknown or suspicious message. Report that message as spam and delete it. Paperweight keeps email analysis on your computer and lets you review the sender before an action.",
  },
  {
    question: "Does Paperweight really unsubscribe me or only filter messages?",
    answer:
      "Paperweight uses the sender's available unsubscribe method. It can send a one-click request, send an unsubscribe email from your account, or open the sender's unsubscribe page. It does not create an inbox filter instead.",
  },
  {
    question: "Can I unsubscribe across multiple email accounts and providers?",
    answer:
      "Yes, with a perpetual license. Paperweight supports multiple accounts across Gmail, Outlook, Proton Mail through Proton Bridge, and other providers that offer IMAP access.",
  },
  {
    question: "Do unsubscribe apps stop unwanted email and spam?",
    answer:
      "Unsubscribe can stop messages from a legitimate mailing list when the sender honors the request. It does not stop all unwanted email or spam. Report suspicious messages as spam instead of interacting with them.",
  },
  {
    question: "Does Paperweight upload or store my email?",
    answer:
      "Paperweight processes email on your computer and stores its local database there. It does not upload your email data to Paperweight servers.",
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
        title="Unsubscribe from unwanted email on your device"
        description="Paperweight finds mailing lists and available unsubscribe methods. You review each sender before the desktop app performs a real unsubscribe action on your computer."
        imageSrc="/dashboard.png"
        imageAlt="Paperweight desktop dashboard showing detected mailing lists and email totals"
        imageWidth={1057}
        imageHeight={880}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <MailCheck
                className="w-10 h-10 text-primary mb-4"
                strokeWidth={1.5}
              />
              <h2 className="text-3xl font-bold mb-4">
                Clean up subscriptions without cloud email processing
              </h2>
              <p className="text-lg opacity-80">
                Paperweight groups promotional senders so you can see which
                lists fill your mailbox. Review the evidence and choose the
                legitimate subscriptions that you want to stop.
              </p>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h3 className="card-title">Review before you unsubscribe</h3>
                <ul className="space-y-3 text-sm opacity-80">
                  <li>Sender name, message count, and last activity</li>
                  <li>Recent message subjects for context</li>
                  <li>One-click, email, or webpage unsubscribe methods</li>
                  <li>Selection, confirmation, and local activity records</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureWorkflow
        heading="How email cleanup works"
        steps={workflowSteps}
      />

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 className="text-3xl font-bold mb-3">
                See the sender and method before you act
              </h2>
              <p className="text-lg opacity-80">
                Paperweight uses standards-based methods when they are available
                and opens a sender's unsubscribe page when manual action is
                needed.
              </p>
            </div>
            <div className="max-w-4xl mx-auto">
              <figure className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl">
                <Image
                  src="/dashboard.png"
                  alt="Paperweight desktop dashboard with a count of detected mailing lists"
                  width={1057}
                  height={880}
                  className="w-full h-auto"
                />
                <figcaption className="p-4 text-sm opacity-70">
                  The real dashboard shows mailing-list totals before you open
                  the detailed review.
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
              <ShieldAlert
                className="w-8 h-8 shrink-0 text-warning"
                strokeWidth={1.5}
              />
              <div>
                <h2 className="text-3xl font-bold mb-3">
                  Choose the safe action for each sender
                </h2>
                <p className="text-lg opacity-80">
                  Unsubscribe is for legitimate mailing lists. Use a different
                  action for suspicious mail or stored personal data.
                </p>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-4">
                <CheckCircle2
                  className="w-6 h-6 shrink-0 text-success"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">
                    Recognized legitimate sender
                  </h3>
                  <p className="text-sm opacity-80">
                    Unsubscribe to stop the mailing-list relationship.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-4">
                <AlertTriangle
                  className="w-6 h-6 shrink-0 text-warning"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">
                    Unknown or suspicious sender
                  </h3>
                  <p className="text-sm opacity-80">
                    Do not click a link or reply. Report the message as spam and
                    delete it.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-4">
                <ShieldAlert
                  className="w-6 h-6 shrink-0 text-info"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">
                    Known company and a data concern
                  </h3>
                  <p className="text-sm opacity-80">
                    Use personal-data deletion. Unsubscribe does not delete an
                    account, old email, or personal data that the company
                    stores.
                  </p>
                </div>
              </div>
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
          },
          {
            title: "Personal data removal",
            description: "Find personal data and prepare deletion requests.",
            href: "/remove-personal-data",
          },
        ]}
      />

      <FeatureFaq items={faqItems} />

      <section className="bg-base-300 py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="max-w-3xl mx-auto text-lg opacity-80">
            Compare local apps, cloud services, and manual cleanup in the{" "}
            <Link href="/guides/email-cleanup-tools-compared" className="link">
              email cleanup tools guide
            </Link>
            .
          </p>
        </div>
      </section>

      <FeatureFinalCta
        heading="Clean up unwanted subscriptions"
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
