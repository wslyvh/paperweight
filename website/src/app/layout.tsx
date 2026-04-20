import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { Providers } from "@/context";
import { SITE_CONFIG } from "@/utils/config";
import { RESOURCE_NAV_LINKS } from "@/utils/nav";
import "@/assets/globals.css";
import Link from "next/link";
import { Newsletter } from "@/components/Newsletter";
import { Github, TwitterIcon } from "lucide-react";

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
                  <div className="flex items-center gap-3">
                    <div className="dropdown dropdown-end dropdown-hover relative">
                      <Link href="/resources" className="btn btn-ghost btn-sm">
                        Resources
                      </Link>
                      <div aria-hidden className="absolute top-full right-0 h-2 w-52" />
                      <ul
                        tabIndex={0}
                        className="dropdown-content menu rounded-box z-10 mt-2 w-52 bg-base-200 p-2 shadow-lg backdrop-blur"
                      >
                        {RESOURCE_NAV_LINKS.filter((item) => item.href !== "/resources").map(
                          (item) => (
                            <li key={item.href}>
                              <Link href={item.href}>{item.label}</Link>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                    <Link href="/#download" className="btn btn-primary btn-sm">
                      Download
                    </Link>
                    <Link
                      href={SITE_CONFIG.GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm btn-square"
                      aria-label="GitHub"
                    >
                      <Github className="h-4 w-4" />
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
                <div className="divider my-0"></div>

                {/* Footer Links */}
                <div className="py-8">
                  <footer className="footer sm:footer-horizontal text-sm">
                    <nav>
                      <span className="text-2xl leading-none mb-4" aria-hidden>
                        {SITE_CONFIG.ICON}
                      </span>
                      <span className="font-medium opacity-80 mb-2">{SITE_CONFIG.TAGLINE}</span>
                      <div className="flex items-center gap-4">
                        <Link
                          href={SITE_CONFIG.GITHUB_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center"
                          aria-label="GitHub"
                        >
                          <Github className="h-5 w-5" />
                        </Link>
                        <Link
                          href={`https://x.com/${SITE_CONFIG.SOCIAL_TWITTER}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center"
                          aria-label="Twitter"
                        ><TwitterIcon className="h-5 w-5" />
                        </Link>
                      </div>
                    </nav>
                    <nav>
                      <h6 className="footer-title">Resources</h6>
                      {RESOURCE_NAV_LINKS.map((item) => (
                        <Link key={item.href} href={item.href} className="link link-hover">
                          {item.label}
                        </Link>
                      ))}
                    </nav>
                    <nav>
                      <h6 className="footer-title">Legal</h6>
                      <Link href="/terms" className="link link-hover">
                        Terms
                      </Link>
                      <Link href="/privacy" className="link link-hover">
                        Privacy
                      </Link>
                    </nav>
                  </footer>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
