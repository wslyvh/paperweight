import { PROVIDER_PRESETS } from "@shared/email-providers";
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
import { SITE_CONFIG } from "@/utils/config";
import { getCryptoPrice, LICENSE_PRICING } from "@/utils/pricing";
import { buildMetadata } from "@/utils/seo";

const title = "Manage Your Digital Footprint";
const description =
  "Paperweight uncovers old accounts, cleans up unwanted mailing lists, and finds exposed personal data. Everything is processed locally on your computer.";

export const metadata = buildMetadata({
  title,
  description,
  path: "/",
});

const homepageFaqItems = [
  {
    question: "What can Paperweight help me do?",
    answer:
      "Paperweight finds company and account evidence, groups mailing lists for review, and helps you prepare personal-data deletion requests.",
  },
  {
    question: "Should I unsubscribe from spam?",
    answer:
      "Unsubscribe only from a legitimate sender that you recognize. Report unknown or suspicious messages as spam instead of interacting with them.",
  },
  {
    question: "Where does Paperweight process my email?",
    answer:
      "Email analysis and the Paperweight database stay on your computer. Paperweight does not send your email data to Paperweight servers.",
  },
  {
    question: "Which email providers does Paperweight support?",
    answer:
      "Paperweight supports Gmail, Outlook, Proton Mail through Proton Bridge, and other providers that offer IMAP access.",
  },
  {
    question: "What are the free version limits?",
    answer:
      "The free version supports one email account and the most recent 90 days of email history. A perpetual license unlocks multiple accounts and unlimited available history.",
  },
] as const;

const structuredData = [
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

const OTHER_EMAIL_PRESETS = PROVIDER_PRESETS.filter(
  (preset) => preset.id !== "apple" && preset.id !== "proton",
);

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
          <p className="text-xl md:text-2xl mb-8 opacity-80">
            Paperweight uncovers old accounts, cleans up unwanted mailing lists,
            and finds exposed personal data. Everything is processed locally on
            your computer.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={SITE_CONFIG.LICENSE_URL}
              className="btn btn-primary btn-lg plausible-event-name=Buy+License"
            >
              Buy a license
            </a>
            <a href="#download" className="btn btn-soft btn-lg">
              Download Paperweight
            </a>
          </div>
          <p className="mt-4 text-sm opacity-70">macOS, Windows, and Linux</p>
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
              Choose the part of your email history that you want to explore or
              clean up.
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
                  <h3 className="card-title text-lg mb-2">Account discovery</h3>
                  <p className="text-sm opacity-80">
                    Find evidence of companies, online accounts, and forgotten
                    services from your past emails.
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
                  <h3 className="card-title text-lg mb-2">Email cleanup</h3>
                  <p className="text-sm opacity-80">
                    Review active mailing lists and unsubscribe from senders
                    using their native methods.
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
                    Personal data removal
                  </h3>
                  <p className="text-sm opacity-80">
                    Detect structured personal data by company and prepare
                    targeted deletion requests.
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
                Your email analysis stays on your device
              </h2>
              <p className="text-lg opacity-80">
                Paperweight connects your computer to your email provider. It
                does not send your email data to Paperweight servers.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <Lock className="w-6 h-6 shrink-0 text-success" aria-hidden />
                <div>
                  <h3 className="font-semibold">Local-first processing</h3>
                  <p className="text-sm opacity-80 mt-1">
                    Email analysis and the Paperweight database stay on your
                    computer.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <Github className="w-6 h-6 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold">Open-source transparency</h3>
                  <p className="text-sm opacity-80 mt-1">
                    The source code is public, so you can inspect how the app
                    handles data.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
                <CheckCircle2
                  className="w-6 h-6 shrink-0 text-info"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold">Review before actions</h3>
                  <p className="text-sm opacity-80 mt-1">
                    You review company evidence, unsubscribe choices, and
                    deletion requests before Paperweight acts.
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
                    A perpetual license grants permanent use. The app and its
                    local data do not depend on an active subscription.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/privacy" className="btn btn-soft btn-sm">
                Read the privacy details
              </Link>
              <a
                href={SITE_CONFIG.GITHUB_URL}
                className="btn btn-ghost btn-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4" /> View source on GitHub
              </a>
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
            Works with Gmail, Outlook, Proton Mail through Proton Bridge, and
            other providers that offer IMAP access.
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
            <p className="text-sm font-medium mb-2">Other email providers</p>
            <p className="text-sm opacity-70">
              e.g. {OTHER_EMAIL_PRESETS.map((preset) => preset.name).join(", ")}{" "}
              or another provider that offers IMAP access
            </p>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Download {SITE_CONFIG.NAME}
          </h2>
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

          {/* Installation notes */}
          <details className="collapse collapse-arrow bg-base-200 rounded-lg border border-base-300 my-8 text-left max-w-2xl mx-auto">
            <summary className="collapse-title min-h-0 py-4 pr-12 text-lg font-bold flex items-center gap-2">
              <Info className="w-5 h-5 shrink-0" strokeWidth={2} />
              Installation notes
            </summary>
            <div className="collapse-content">
              <ul className="space-y-3 text-sm opacity-80 pt-2">
                <li>
                  <strong>Windows</strong> - Run the installer. If Windows
                  SmartScreen shows a warning, click &quot;More info&quot; and
                  then &quot;Run anyway&quot; to proceed.
                </li>
                <li>
                  <strong>macOS</strong> - Open the downloaded DMG and drag
                  Paperweight to your Applications folder.
                </li>
                <li>
                  <strong>Linux AppImage</strong> - Right-click → Properties →
                  Permissions → check &quot;Allow executing file as
                  program&quot;, or run{" "}
                  <code className="bg-base-300 px-1 rounded">
                    chmod +x Paperweight*.AppImage
                  </code>
                  .{" "}
                </li>
                <li>
                  <strong>Linux deb</strong> - Double-click the file to install,
                  or run{" "}
                  <code className="bg-base-300 px-1 rounded">
                    sudo dpkg -i Paperweight*.deb
                  </code>
                  .
                </li>
              </ul>
            </div>
          </details>

          <p className="text-sm opacity-70">
            Latest version: v{latestVersion} ·{" "}
            <Link href="/changelog" className="link">
              All releases
            </Link>
          </p>
        </div>
      </section>

      <section id="pricing" className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Start free or buy once</h2>
            <p className="text-lg opacity-80 mb-3">
              The free version supports one email account and the most recent 90
              days of email history. A ${LICENSE_PRICING.LICENSE_PRICE}{" "}
              perpetual license unlocks multiple accounts and unlimited
              available history.
            </p>
            <p className="text-sm opacity-70 mb-8">
              Crypto checkout is also available for ${getCryptoPrice()}.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={SITE_CONFIG.LICENSE_URL}
                className="btn btn-primary plausible-event-name=Buy+License"
              >
                Buy License
              </a>
              <a href="#download" className="btn btn-soft">
                Download free
              </a>
              <Link href="/pricing" className="btn btn-ghost">
                Compare pricing
              </Link>
            </div>
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
