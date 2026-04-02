import Link from "next/link";
import Image from "next/image";
import { SITE_CONFIG } from "@/utils/config";
import { getLatestVersion } from "@/lib/github";
import {
  Mail,
  ShieldAlert,
  Map,
  FileText,
  Lock,
  Github,
  Info,
} from "lucide-react";

export const HOME_LAST_UPDATED = "2026-04-02";

export default async function Home() {
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    throw new Error("No releases found from GitHub API");
  }
  return (
    <>
      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-24 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            {SITE_CONFIG.TAGLINE}
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-80">
            {SITE_CONFIG.DESCRIPTION}
          </p>
          <p className="text-accent mb-8 text-lg">
            Your inbox knows where your data lives.
          </p>
          <Link href="/#download" className="btn btn-primary btn-lg">
            Download for free
          </Link>
          <p className="mt-4 text-sm opacity-60">macOS · Windows · Linux</p>
        </div>
      </section>

      {/* Preview */}
      <section className="bg-base-200 pt-20 pb-10">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-2">See it in action</h2>
            <p className="text-lg opacity-80 mb-10">
              Messages synced, mailing lists, and daily email trends at a
              glance.
            </p>
            <div className="relative mx-auto max-w-3xl rounded-2xl overflow-hidden border border-base-300 shadow-2xl ring-1 ring-base-content/5">
              <Image
                src="/dashboard.png"
                alt="Paperweight dashboard showing messages synced, mailing lists, accounts, and daily email chart"
                width={1057}
                height={880}
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
            <h2 className="text-3xl font-bold mb-2 text-center">Features</h2>
            <p className="text-lg opacity-80 mb-10 text-center">
              What you can do with Paperweight.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <Mail
                    className="w-12 h-12 text-primary mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Bulk Unsubscribe</h3>
                  <p className="text-sm opacity-80">
                    Unsubscribe from dozens of mailing lists at once. Clean your
                    inbox in minutes, not hours.
                  </p>
                </div>
              </div>

              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <ShieldAlert
                    className="w-12 h-12 text-error mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Breach Alerts</h3>
                  <p className="text-sm opacity-80">
                    See which companies you use have been breached. Powered by
                    Have I Been Pwned.
                  </p>
                </div>
              </div>

              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <Map className="w-12 h-12 text-info mb-4" strokeWidth={1.5} />
                  <h3 className="card-title text-lg mb-2">Account Inventory</h3>
                  <p className="text-sm opacity-80">
                    Find every company that has your data. Identify high-risk
                    accounts and forgotten services.
                  </p>
                </div>
              </div>

              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <FileText
                    className="w-12 h-12 text-warning mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">GDPR Deletion</h3>
                  <p className="text-sm opacity-80">
                    Generate data deletion requests with pre-filled templates
                    and company contacts.
                  </p>
                </div>
              </div>

              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <Lock
                    className="w-12 h-12 text-success mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Privacy-First</h3>
                  <p className="text-sm opacity-80">
                    Everything happens locally on your computer. Your emails
                    never leave your machine.
                  </p>
                </div>
              </div>

              <div className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <Github
                    className="w-12 h-12 text-base-content mb-4"
                    strokeWidth={1.5}
                  />
                  <h3 className="card-title text-lg mb-2">Open Source</h3>
                  <p className="text-sm opacity-80">
                    Code is public and auditable. Local-first and transparent by
                    design.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Supports */}
      <section className="bg-base-300 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-2">Supported email providers</h2>
          <p className="text-sm opacity-60 mb-8">
            Works with any IMAP provider
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8">
            <span className="text-lg">Gmail</span>
            <span className="text-lg">Outlook</span>
            <span className="text-lg">IMAP</span>
            <span className="text-lg opacity-50">iCloud (soon)</span>
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
            Free to try. All features included for 30 days.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 mb-4">
            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.exe`}
              className="btn btn-soft btn-lg w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48 plausible-event-name=Download+Windows"
            >
              Windows
            </Link>
            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.dmg`}
              className="btn btn-soft btn-lg w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48 plausible-event-name=Download+macOS"
            >
              macOS
            </Link>

            <div className="w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48">
              <Link
                href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.AppImage`}
                className="btn btn-soft btn-lg w-full plausible-event-name=Download+Linux"
              >
                Linux
              </Link>
              <br />
              <Link
                href={`${SITE_CONFIG.GITHUB_URL}/releases/download/v${latestVersion}/Paperweight-${latestVersion}.deb`}
                className="link text-sm plausible-event-name=Download+Linux+deb"
              >
                or <span className="font-bold">.deb</span> package
              </Link>
            </div>
          </div>

          {/* Installation notes */}
          <div className="collapse collapse-arrow bg-base-200 rounded-lg border border-base-300 my-8 text-left max-w-xl mx-auto">
            <input type="checkbox" />
            <div className="collapse-title min-h-0 py-4 pr-12">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <Info className="w-5 h-5 shrink-0" strokeWidth={2} />
                Installation notes
              </h3>
              <p className="text-sm opacity-80">
                The app is not code-signed or verified by a trusted certificate
                authority. Your system may block or warn about it. Expand for
                platform steps.
              </p>
            </div>
            <div className="collapse-content">
              <ul className="space-y-3 text-sm opacity-80 pt-2">
                <li>
                  <strong>Windows</strong> - Run the installer. Windows
                  SmartScreen may show a warning because the app is unsigned.
                  Click &quot;More info&quot; and then &quot;Run anyway&quot; to
                  proceed.
                </li>
                <li>
                  <strong>macOS</strong> - Go to System Settings → Privacy &
                  Security, scroll to the Security section, and click &quot;Open
                  Anyway&quot; next to the blocked app. You may need to enter
                  your admin password. Alternatively, hold Control, click the
                  app, and select Open (security bypass).
                </li>
                <li>
                  <strong>Linux AppImage</strong> - Right-click the file →
                  Properties → Permissions → check &quot;Allow executing file as
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
          </div>

          <p className="text-sm opacity-60">
            Latest version: v{latestVersion} ·{" "}
            <Link href="/changelog" className="link">
              All releases
            </Link>
          </p>
        </div>
      </section>

      <section id="pricing" className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Pricing</h2>
              <p className="text-xl opacity-80">
                Try it free. Upgrade for unlimited history and multi-account support.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
              {/* Free Tier */}
              <div className="bg-base-100 rounded-lg p-8 border-2 border-base-300 flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">Free</h3>
                  <div className="text-4xl font-bold mb-2">$0</div>
                  <div className="text-sm opacity-60">Always free</div>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Core features included</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>30-day email scan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Bulk unsubscribe</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Breach alerts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Account mapping</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>GDPR templates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Community support</span>
                  </li>
                </ul>

                <div className="mt-auto">
                  <Link href="/#download" className="btn btn-soft btn-block">
                    Download free
                  </Link>
                </div>
              </div>

              {/* Paid Tier */}
              <div className="bg-base-100 rounded-lg p-8 border-2 border-primary relative flex flex-col">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-content px-4 py-1 rounded-full text-sm font-semibold">
                    Early Supporter
                  </span>
                </div>
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">Perpetual License</h3>
                  <div className="text-4xl font-bold mb-2">$69</div>
                  <div className="text-sm opacity-60 mb-1">
                    One-time payment
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span><strong>All features included</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>
                      <strong>Unlimited email history</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>
                      <strong>Multi-account support</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Permanent use of Paperweight</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Supports open-source software</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>V1 updates included</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>1 year email support</span>
                  </li>
                </ul>

                <div className="mt-auto">
                  <a
                    href={SITE_CONFIG.LICENSE_URL}
                    className="btn btn-primary btn-block plausible-event-name=Buy+License"
                  >
                    Buy License
                  </a>
                </div>
              </div>
            </div>

            <p className="text-center text-sm opacity-60 mt-8">
              *Early supporter pricing. Your license includes support and updates through the first major release (v1).
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
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="card bg-base-200/50">
                <div className="card-body">
                  <h3 className="card-title">GDPR Request Generator</h3>
                  <p className="opacity-80">
                    Generate a data deletion or access request for any company.
                    Free, no download required.
                  </p>
                  <div className="card-actions">
                    <Link
                      href="/resources/gdpr-generator"
                      className="btn btn-primary btn-sm"
                    >
                      Try it →
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
