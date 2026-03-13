import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { Providers } from "@/context";
import { SITE_CONFIG } from "@/utils/config";
import "@/assets/globals.css";
import Link from "next/link";
import { Newsletter } from "@/components/Newsletter";

export const metadata: Metadata = {
  applicationName: SITE_CONFIG.NAME,
  title: `${SITE_CONFIG.NAME} | ${SITE_CONFIG.TAGLINE}`,
  description: SITE_CONFIG.DESCRIPTION,
  metadataBase: new URL(SITE_CONFIG.URL),
  openGraph: {
    type: "website",
    title: `${SITE_CONFIG.NAME} | ${SITE_CONFIG.TAGLINE}`,
    siteName: SITE_CONFIG.NAME,
    description: SITE_CONFIG.DESCRIPTION,
    url: SITE_CONFIG.URL,
    images: `${SITE_CONFIG.URL}/og.png`,
  },
  twitter: {
    card: "summary_large_image",
    site: SITE_CONFIG.SOCIAL_TWITTER,
    title: `${SITE_CONFIG.NAME} | ${SITE_CONFIG.TAGLINE}`,
    description: SITE_CONFIG.DESCRIPTION,
    images: `${SITE_CONFIG.URL}/og.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  height: "device-height",
  initialScale: 1.0,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout(props: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header>
              <div className="container mx-auto px-4 py-6">
                <nav className="flex items-center justify-between">
                  <Link
                    href="/"
                    className="text-xl font-bold flex items-center gap-2"
                  >
                    <span>🗿</span>
                    <span>Paperweight</span>
                  </Link>
                  <div className="flex items-center gap-6">
                    <Link
                      href={SITE_CONFIG.GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      GitHub
                    </Link>
                    <Link href="#download" className="btn btn-primary btn-sm">
                      Download
                    </Link>
                  </div>
                </nav>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1">{props.children}</main>

            {/* Footer */}
            <footer className="bg-base-100">
              <div className="container mx-auto px-4">
                {/* Newsletter */}
                <div className="max-w-md mx-auto text-center py-16">
                  <h2 className="text-2xl font-bold mb-4">Get updates</h2>
                  <p className="mb-6 opacity-80">
                    Sign up for launch announcements and feature updates.
                  </p>
                  <Newsletter />
                </div>

                {/* Divider */}
                <div className="border-t border-base-300"></div>

                {/* Footer Links */}
                <div className="py-8">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span>
                        Built by{" "}
                        <a
                          href="https://x.com/wslyvh"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-primary"
                        >
                          wslyvh
                        </a>
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Link href="/changelog" className="hover:underline">
                        Changelog
                      </Link>
                      <Link href="/privacy" className="hover:underline">
                        Privacy
                      </Link>
                      <Link href="/terms" className="hover:underline">
                        Terms
                      </Link>
                      <Link
                        href={SITE_CONFIG.GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        Open source
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
