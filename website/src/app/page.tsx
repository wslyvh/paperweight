import {
  AppleLogo,
  GoogleLogo,
  MicrosoftLogo,
  ProtonLogo,
} from "@shared/provider-logos";
import dayjs from "dayjs";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Github,
  Info,
  Lock,
  Mail,
  MapIcon,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getLatestVersion } from "@/lib/github";
import { getBreachIndexItems } from "@/utils/breach";
import { ORGANIZATION_SCHEMA, SITE_CONFIG } from "@/utils/config";
import { getCryptoPrice, LICENSE_PRICING } from "@/utils/pricing";
import { buildMetadata } from "@/utils/seo";

const title = "Manage Your Digital Footprint";
const description =
  "Your inbox knows where your data lives. Paperweight uncovers old accounts, cleans up unwanted mailing lists, and helps you remove exposed personal data.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/",
});

const homepageFaqItems = [
  {
    question: "What does Paperweight do?",
    answer:
      "Paperweight connects directly to your inbox on your machine. It reconstructs an inventory of accounts you have created, finds active mailing lists with real unsubscribe options, and detects exposed personal data so you can request deletion.",
  },
  {
    question: "How is Paperweight different from online cleanup services?",
    answer:
      "Most email cleanup tools scan your inbox on their cloud servers, and some monetize that data. Paperweight runs 100% locally on your computer. There are no intermediary servers, no telemetry, and no data collection.",
  },
  {
    question: "Should I unsubscribe from spam messages?",
    answer:
      "No. Only unsubscribe from legitimate senders and recognizable companies. For suspicious or unknown spam, use your provider's spam reporting button so you do not confirm that your address is active.",
  },
  {
    question: "Which email providers are supported?",
    answer:
      "Paperweight supports Gmail, Outlook, Proton Mail via Proton Bridge, and standard IMAP email accounts.",
  },
  {
    question: "What are the free version limits vs lifetime license?",
    answer:
      "The free download allows you to scan one email account and the most recent 90 days of history with all core features included. A lifetime license unlocks unlimited history and multiple email accounts.",
  },
] as const;

const structuredData = [
  ORGANIZATION_SCHEMA,
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_CONFIG.NAME,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "macOS, Windows, Linux",
    url: SITE_CONFIG.URL,
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
        name: "Lifetime license via Polar",
        price: LICENSE_PRICING.LICENSE_PRICE,
        priceCurrency: "USD",
        url: SITE_CONFIG.LICENSE_URL,
      },
      {
        "@type": "Offer",
        name: "Lifetime license paid with crypto",
        price: getCryptoPrice(),
        priceCurrency: "USD",
        url: `${SITE_CONFIG.URL}/pricing`,
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: homepageFaqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  },
];

const OAUTH_PROVIDER_ICONS = [
  { logo: <GoogleLogo className="w-9 h-9" />, label: "Google" },
  { logo: <MicrosoftLogo className="w-9 h-9" />, label: "Microsoft" },
  { logo: <AppleLogo className="w-9 h-9 fill-current" />, label: "Apple" },
  { logo: <ProtonLogo className="w-9 h-9" />, label: "Proton" },
] as const;

export default async function Home() {
  const latestVersion = await getLatestVersion();
  const latestBreaches = getBreachIndexItems()
    .slice(0, 3)
    .map((breach) => {
      const daysAgo = dayjs().diff(
        breach.addedDate?.slice(0, 10) || breach.breachDate,
        "day",
      );
      const daysAgoLabel =
        daysAgo === 0
          ? "Today"
          : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
      return { ...breach, daysAgoLabel };
    });
  if (!latestVersion) {
    throw new Error("No releases found from GitHub API");
  }
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from static constants in this module.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-24 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Manage your digital footprint
          </h1>
          <p className="text-xl md:text-2xl mb-6 opacity-80">
            Paperweight scans your inbox to map your digital footprint, then
            helps you take back control and delete your data. Local-first and
            open source.
          </p>
          <p className="text-lg font-medium text-accent mb-8">
            Your inbox knows where your data lives.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="#download" className="btn btn-primary btn-lg">
              Download for free
            </a>
          </div>
          <p className="mt-4 text-sm opacity-70">macOS · Windows · Linux</p>
        </div>
      </section>

      {/* Preview */}
      <section className="bg-base-200 pt-20 pb-10">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-2">See it in action</h2>
            <p className="text-lg opacity-80 mb-10">
              Review companies, mailing lists, and personal data found in your
              email history.
            </p>
            <div className="relative mx-auto max-w-3xl rounded-2xl overflow-hidden border border-base-300 shadow-2xl ring-1 ring-base-content/5">
              <Image
                src="/features/dashboard.png"
                alt="Paperweight dashboard showing messages synced, mailing lists, accounts, and daily email chart"
                width={1024}
                height={1002}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-base-200 pt-10 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold mb-2 text-center">
              Three ways to reduce your digital footprint
            </h2>
            <p className="text-lg opacity-80 mb-10 text-center">
              Turn your email history into a practical view of old accounts,
              unwanted mailing lists, and exposed personal data.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <Link
                href="/account-discovery"
                className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
              >
                <div className="card-body items-center text-center">
                  <MapIcon
                    className="w-12 h-12 text-info mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Find old accounts</h3>
                  <p className="text-sm opacity-80">
                    Reconstruct forgotten services and company relationships
                    from sign-up messages, receipts, password resets, and
                    security alerts.
                  </p>
                </div>
              </Link>

              <Link
                href="/email-cleanup"
                className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
              >
                <div className="card-body items-center text-center">
                  <Mail
                    className="w-12 h-12 text-primary mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Bulk unsubscribe</h3>
                  <p className="text-sm opacity-80">
                    Compare active mailing lists, identify the senders creating
                    the most noise, and unsubscribe at the source.
                  </p>
                </div>
              </Link>

              <Link
                href="/remove-personal-data"
                className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
              >
                <div className="card-body items-center text-center">
                  <FileText
                    className="w-12 h-12 text-warning mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">
                    Remove personal data
                  </h3>
                  <p className="text-sm opacity-80">
                    Find phone numbers, addresses, payment details, and
                    identifiers in past messages, then prepare deletion
                    requests.
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-base-300 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <ShieldCheck
                className="w-10 h-10 text-success mx-auto mb-4"
                strokeWidth={1.5}
              />
              <h2 className="text-3xl font-bold mb-3">
                Built for privacy from the ground up
              </h2>
              <p className="text-lg opacity-80">
                A privacy tool that reads your data in the cloud is not a
                privacy tool. Paperweight connects directly to your provider and
                stays on your computer.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <Lock className="w-6 h-6 shrink-0 text-success" aria-hidden />
                <div>
                  <h3 className="font-semibold">100% local processing</h3>
                  <p className="text-sm opacity-80 mt-1">
                    All analysis runs on your device. There are no Paperweight
                    servers and your emails are never shared with anyone.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <Github className="w-6 h-6 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold">Open source and auditable</h3>
                  <p className="text-sm opacity-80 mt-1">
                    Publicly available under the permissive MIT license. Inspect
                    the code, verify our claims, or build it yourself.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <CheckCircle2
                  className="w-6 h-6 shrink-0 text-info"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">Review before action</h3>
                  <p className="text-sm opacity-80 mt-1">
                    You stay in complete control. Review sender evidence and
                    request templates before anything is sent.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <ShieldCheck
                  className="w-6 h-6 shrink-0 text-accent"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">The walk-away test</h3>
                  <p className="text-sm opacity-80 mt-1">
                    Zero lock-ins. No servers to maintain, no subscriptions, and
                    a lifetime license that works permanently.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={SITE_CONFIG.GITHUB_URL}
                className="btn btn-outline btn-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </a>
              <Link href="/privacy" className="btn btn-ghost btn-sm">
                Privacy policy
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">
              Frequently asked questions
            </h2>
            <div className="space-y-3">
              {homepageFaqItems.map((item) => (
                <details
                  key={item.question}
                  className="collapse collapse-arrow bg-base-100 border border-base-300"
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

      {/* Email providers */}
      <section className="bg-base-300 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-2">Supported email providers</h2>
          <p className="text-sm opacity-70 mb-8">
            Works with any IMAP provider
          </p>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
            {OAUTH_PROVIDER_ICONS.map((option) => (
              <div
                key={option.label}
                className="flex w-36 flex-col items-center gap-2"
              >
                <div className="flex h-16 w-16 items-center justify-center opacity-80">
                  {option.logo}
                </div>
                <span className="text-sm font-medium opacity-80">
                  {option.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-2xl">
            <p className="text-sm opacity-70">
              Works with any provider that offers IMAP access
            </p>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h2 className="text-3xl font-bold">Download {SITE_CONFIG.NAME}</h2>
            <label
              htmlFor="installation_notes_toggle"
              className="btn btn-ghost btn-circle btn-xs opacity-70 hover:opacity-100 cursor-pointer"
              aria-label="Installation notes"
            >
              <Info className="w-4 h-4" />
            </label>
          </div>
          <p className="text-lg opacity-80 mb-8">
            Download and try Paperweight free.
          </p>

          <div className="max-w-2xl mx-auto mb-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <a
                href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.exe`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-soft btn-lg w-full plausible-event-name=Download+Windows"
              >
                Windows
              </a>
              <a
                href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.dmg`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-soft btn-lg w-full plausible-event-name=Download+macOS"
              >
                macOS
              </a>

              <div className="w-full">
                <a
                  href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.AppImage`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-soft btn-lg w-full plausible-event-name=Download+Linux"
                >
                  Linux
                </a>
                <br />
                <a
                  href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.deb`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link text-sm plausible-event-name=Download+Linux+deb"
                >
                  or <span className="font-bold">.deb</span> package
                </a>
              </div>
            </div>
          </div>

          <p className="text-sm opacity-70">
            If download does not start, get the latest release from{" "}
            <a
              href={`${SITE_CONFIG.GITHUB_URL}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitHub Releases
            </a>
            .
          </p>

          <p className="text-sm opacity-70 mt-4">
            Latest version: v{latestVersion} ·{" "}
            <Link href="/changelog" className="link">
              All releases
            </Link>
          </p>

          {/* Installation notes DaisyUI modal (checkbox-driven, zero JS) */}
          <input
            type="checkbox"
            id="installation_notes_toggle"
            className="modal-toggle"
          />
          <div className="modal" role="dialog">
            <div className="modal-box text-left">
              <label
                htmlFor="installation_notes_toggle"
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                aria-label="Close"
              >
                ✕
              </label>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-info" /> Installation notes
              </h3>
              <ul className="space-y-3 text-sm opacity-80">
                <li>
                  <strong>Windows</strong>: Run the installer. If Windows
                  SmartScreen shows a warning, click &quot;More info&quot; and
                  then &quot;Run anyway&quot; to proceed.
                </li>
                <li>
                  <strong>macOS</strong>: Open the downloaded DMG and drag
                  Paperweight to your Applications folder.
                </li>
                <li>
                  <strong>Linux AppImage</strong>: Right-click → Properties →
                  Permissions → check &quot;Allow executing file as
                  program&quot;, or run{" "}
                  <code className="bg-base-300 px-1 rounded">
                    chmod +x Paperweight*.AppImage
                  </code>
                  .
                </li>
                <li>
                  <strong>Linux deb</strong>: Double-click the file to install,
                  or run{" "}
                  <code className="bg-base-300 px-1 rounded">
                    sudo dpkg -i Paperweight*.deb
                  </code>
                  .
                </li>
              </ul>
            </div>
            <label
              className="modal-backdrop"
              htmlFor="installation_notes_toggle"
            >
              Close
            </label>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">
              Try free or buy a lifetime license
            </h2>
            <p className="text-lg opacity-80 mb-6">
              Scan one email account and the most recent 90 days of history for
              free. Get a ${LICENSE_PRICING.LICENSE_PRICE} lifetime license for
              unlimited history and multi-account support.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={SITE_CONFIG.LICENSE_URL}
                className="btn btn-primary plausible-event-name=Buy+License"
              >
                Buy Lifetime License
              </a>
              <Link href="/pricing" className="btn btn-soft">
                View pricing details
              </Link>
            </div>
            <p className="text-xs opacity-60 mt-4">
              *Early supporter pricing, limited until V1 release.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-3">Resources & Tools</h2>
              <p className="text-lg opacity-80">
                Free tools and guides to help you manage your digital footprint.
              </p>
              <div className="mt-4">
                <Link href="/resources" className="btn btn-soft btn-sm">
                  View all resources
                </Link>
              </div>
            </div>

            <div className="max-w-5xl mx-auto grid gap-6 md:grid-cols-2 items-stretch">
              <div className="card bg-base-200/50 h-full">
                <div className="card-body h-full flex flex-col">
                  <h3 className="card-title">GDPR Request Generator</h3>
                  <div className="space-y-5">
                    <p className="opacity-80">
                      Access or delete your data with a pre-filled GDPR request.
                      Choose your action, select an organization, add your
                      details, and copy or open the generated email template.
                    </p>

                    <div className="grid gap-2">
                      <Link
                        href="/resources/gdpr-generator?action=access"
                        className="btn btn-outline justify-start w-full"
                      >
                        Access my data
                      </Link>
                      <Link
                        href="/resources/gdpr-generator?action=delete"
                        className="btn btn-primary justify-start w-full"
                      >
                        Remove my data
                      </Link>
                    </div>

                    <p className="text-sm opacity-75">
                      Or find more information about your local{" "}
                      <Link href="/resources/authorities" className="link">
                        data protection authority
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>

              <div className="card bg-base-200/50 h-full">
                <div className="card-body h-full flex flex-col">
                  <h3 className="card-title">Latest Data Breaches</h3>
                  <p className="opacity-80 mb-3">
                    Recent breach guides with impact details and what to do
                    next.
                  </p>

                  <ul className="space-y-2">
                    {latestBreaches.map((breach) => (
                      <li key={breach.slug}>
                        <Link
                          href={`/breaches/${breach.slug}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-base-100 px-3 py-2.5 hover:bg-base-100/80 transition-colors"
                        >
                          <p className="font-medium truncate min-w-0">
                            {breach.title}
                          </p>
                          <div className="shrink-0 flex items-center gap-2 text-xs opacity-80">
                            <span>{breach.daysAgoLabel}</span>
                            <span
                              className={`badge badge-xs badge-soft ${breach.riskBadgeClass}`}
                            >
                              {breach.riskLabel}
                            </span>
                            <ChevronRight className="h-4 w-4 opacity-50" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="card-actions mt-auto pt-4 justify-end">
                    <Link href="/breaches" className="btn btn-soft btn-sm">
                      View all data breaches →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
