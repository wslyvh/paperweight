import Link from "next/link";
import { Newsletter } from "@/components/Newsletter";
import { SITE_CONFIG } from "@/utils/config";
import { Mail, ShieldAlert, Map, FileText, Lock, Github } from "lucide-react";

export default function Home() {
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
          <a href="#download" className="btn btn-primary btn-lg">
            Download for free
          </a>
          <p className="mt-4 text-sm opacity-60">macOS · Windows · Linux</p>
        </div>
      </section>

      {/* Features */}
      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
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
              href={`${SITE_CONFIG.GITHUB_URL}/releases/latest/download/Paperweight-0.1.0.dmg`}
              className="btn btn-outline btn-lg w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48 plausible-event-name=Download+macOS"
            >
              macOS
            </Link>

            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases/latest/download/Paperweight-0.1.0.exe`}
              className="btn btn-outline btn-lg w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48 plausible-event-name=Download+Windows"
            >
              Windows
            </Link>

            <div className="w-full sm:flex-1 sm:min-w-[8rem] sm:max-w-48">
              <Link
                href={`${SITE_CONFIG.GITHUB_URL}/releases/latest/download/Paperweight-0.1.0.AppImage`}
                className="btn btn-outline btn-lg w-full plausible-event-name=Download+Linux"
              >
                Linux
              </Link>
              <br />
              <Link
                href={`${SITE_CONFIG.GITHUB_URL}/releases/latest/download/Paperweight-0.1.0.deb`}
                className="link text-sm"
              >
                or <span className="font-bold">.deb</span> package
              </Link>
            </div>
          </div>

          {/* Installation notes */}
          <div className="bg-base-200 rounded-lg p-4 mb-6 text-sm text-left max-w-xl mx-auto">
            <p className="font-semibold mb-2">Installation notes:</p>
            <ul className="space-y-1 opacity-80">
              <li>
                <strong>macOS:</strong> Right-click → Open (security bypass)
              </li>
              <li>
                <strong>Windows:</strong> Run installer, may show SmartScreen
                warning
              </li>
              <li>
                <strong>Linux:</strong> Make AppImage executable:{" "}
                <code className="bg-base-300 px-1 rounded">
                  chmod +x Paperweight*.AppImage
                </code>
              </li>
            </ul>
          </div>

          <p className="text-sm opacity-60">
            Latest version: v0.1.0 ·{" "}
            <a href={`${SITE_CONFIG.GITHUB_URL}/releases`} className="link">
              All releases
            </a>
          </p>
        </div>
      </section>

      <section id="pricing" className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Pricing</h2>
              <p className="text-xl opacity-80">
                Try it free. Upgrade for unlimited history.
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
                    <span>30-day email scan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>All features included</span>
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
                </ul>

                <div className="mt-auto">
                  <a href="#download" className="btn btn-outline btn-block">
                    Download free
                  </a>
                  <div
                    className="text-xs text-center mt-4 opacity-0"
                    aria-hidden="true"
                  >
                    &nbsp;
                  </div>
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
                  <h3 className="text-2xl font-bold mb-2">Lifetime License</h3>
                  <div className="text-4xl font-bold mb-2">$19</div>
                  <div className="text-sm opacity-60 mb-1">
                    One-time payment
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>
                      <strong>Unlimited email history</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>All features included</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Lifetime updates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    <span>Support development</span>
                  </li>
                </ul>

                <div className="mt-auto">
                  <a
                    href={SITE_CONFIG.LICENSE_URL}
                    className="btn btn-primary btn-block plausible-event-name=Buy+License"
                  >
                    Buy lifetime license
                  </a>

                  <p className="text-xs text-center mt-4 opacity-60">
                    Limited early supporter pricing
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-sm opacity-60 mt-8">
              All features available in free tier. Upgrade for unlimited email
              history.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
