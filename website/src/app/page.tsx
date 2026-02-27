import Link from "next/link";
import { Newsletter } from "@/components/Newsletter";
import { SITE_CONFIG } from "@/utils/config";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          {SITE_CONFIG.TAGLINE}
        </h1>
        <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto opacity-80">
          {SITE_CONFIG.DESCRIPTION}
        </p>
        <p className="text-accent mb-8 max-w-2xl mx-auto opacity-80">
          Your inbox knows where your data lives.
        </p>
        <a href="#download" className="btn btn-primary btn-lg">
          Download for free
        </a>
        <p className="mt-4 text-sm opacity-60">macOS · Windows · Linux</p>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-4xl mb-4">🗿</div>
            <h3 className="text-xl font-bold mb-2">
              Take control of your inbox
            </h3>
            <p className="opacity-80">
              Take control of your inbox. See who emails you the most, spot
              which vendors show up in your inbox, and unsubscribe from unwanted
              emails.
            </p>
          </div>

          <div className="text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold mb-2">Inside your inbox</h3>
            <p className="opacity-80">
              Track newsletter volume, identify account activity, and find
              vendor patterns, with simple workflows to clean things up.
            </p>
          </div>

          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold mb-2">Your data stays yours</h3>
            <p className="opacity-80">
              Your data stays yours. Paperweight scans emails locally on your
              computer. Nothing sent to external servers. You stay in control.
            </p>
          </div>
        </div>
      </section>

      {/* Supports */}
      <section className="bg-base-200 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-8">Supported email providers</h2>
          <div className="flex flex-wrap justify-center items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-lg">IMAP</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">Gmail</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">Outlook</span>
            </div>
            <div className="flex items-center gap-2 opacity-50">
              <span className="text-lg">iCloud (soon)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">
            Download {SITE_CONFIG.NAME}
          </h2>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases`}
              className="btn btn-outline btn-lg plausible-event-name=Download+macOS"
            >
              macOS
            </Link>
            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases`}
              className="btn btn-outline btn-lg plausible-event-name=Download+Windows"
            >
              Windows
            </Link>
            <Link
              href={`${SITE_CONFIG.GITHUB_URL}/releases`}
              className="btn btn-outline btn-lg plausible-event-name=Download+Linux"
            >
              Linux
            </Link>
          </div>
          <p className="text-sm opacity-60">
            Free to scan 30 days of email.{" "}
            <a href="#license" className="link">
              Lifetime license
            </a>{" "}
            for unlimited history.
          </p>
        </div>
      </section>

      {/* License */}
      <section id="license" className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">
              Early supporters lifetime license
            </h2>
            <p className="text-xl mb-6 opacity-80">
              Get unlimited email sync and all future updates for a one-time
              payment.
            </p>
            <div className="bg-base-100 rounded-lg p-8 mb-6">
              <div className="text-4xl font-bold mb-2">$19</div>
              <div className="text-sm opacity-60 mb-4">
                One-time payment · Lifetime access
              </div>
              <ul className="text-left space-y-2 mb-6 max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>Unlimited email history sync</span>
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
                  <span>Support development</span>
                </li>
              </ul>
              <a
                href={SITE_CONFIG.LICENSE_URL}
                className="btn btn-primary btn-lg plausible-event-name=Buy+License"
              >
                Buy lifetime license
              </a>
            </div>
            <p className="text-sm opacity-60">
              *Temporary early supporters price only.
            </p>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Get updates</h2>
          <p className="mb-6 opacity-80">
            Sign up for launch announcements and feature updates.
          </p>

          <Newsletter />
        </div>
      </section>
    </>
  );
}
