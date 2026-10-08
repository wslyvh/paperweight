"use client";

import { Github, Menu, TwitterIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useEffect, useRef, useState } from "react";
import { NavDropdown } from "@/components/NavDropdown";
import { Newsletter } from "@/components/Newsletter";
import { SITE_CONFIG } from "@/utils/config";

/** Pages that ship their own layout (no main-site nav/footer). */
const STANDALONE_ROUTES = ["/irl"];

interface NavLink {
  href: string;
  label: string;
}

interface LayoutSelectorProps extends PropsWithChildren {
  featureNavLinks: NavLink[];
  guideNavLinks: NavLink[];
  resourceNavLinks: NavLink[];
}

export function LayoutSelector(props: LayoutSelectorProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const standalone = STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  useEffect(() => {
    const backgroundElements = [
      headerRef.current,
      mainRef.current,
      footerRef.current,
    ];

    if (!mobileMenuOpen) return;

    backgroundElements.forEach((element) => {
      element?.setAttribute("inert", "");
    });
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }

      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      backgroundElements.forEach((element) => {
        element?.removeAttribute("inert");
      });
      menuButtonRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  if (standalone) {
    return props.children;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header ref={headerRef}>
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center justify-between">
            <Link
              href="/"
              className="text-xl font-bold flex items-center gap-2"
            >
              <span>🗿</span>
              <span>Paperweight</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden lg:flex items-center gap-3">
              <NavDropdown label="Features" links={props.featureNavLinks} />
              <NavDropdown
                label="Resources"
                href="/resources"
                links={props.resourceNavLinks}
              />
              <NavDropdown
                label="Guides"
                href="/guides"
                links={props.guideNavLinks}
              />
              <Link href="/pricing" className="btn btn-ghost btn-sm">
                Pricing
              </Link>
              <a href="/#download" className="btn btn-primary btn-sm">
                Download
              </a>
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

            {/* Mobile header */}
            <div className="flex lg:hidden items-center gap-2">
              <a href="/#download" className="btn btn-primary btn-sm">
                Download
              </a>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          {/* Sidebar panel */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            className="fixed right-0 top-0 h-full w-72 bg-base-200 shadow-xl p-6 flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <span id="mobile-menu-title" className="text-lg font-bold">
                Menu
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6">
              <div>
                <span className="font-semibold opacity-70 mb-2 block">
                  Features
                </span>
                <ul className="space-y-1 ml-2">
                  {props.featureNavLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block py-1.5 hover:opacity-80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Resources section */}
              <div>
                <Link
                  href="/resources"
                  className="font-semibold opacity-70 mb-2 block"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Resources
                </Link>
                <ul className="space-y-1 ml-2">
                  {props.resourceNavLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block py-1.5 hover:opacity-80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Guides section */}
              <div>
                <Link
                  href="/guides"
                  className="font-semibold opacity-70 mb-2 block"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Guides
                </Link>
                <ul className="space-y-1 ml-2">
                  {props.guideNavLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block py-1.5 hover:opacity-80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/pricing"
                className="font-semibold block"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </Link>
            </div>

            {/* Nav footer with socials */}
            <div className="border-t border-base-300 pt-4 mt-6">
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
                >
                  <TwitterIcon className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <main ref={mainRef} className="flex-1">
        {props.children}
      </main>

      <footer ref={footerRef} className="bg-base-100">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto text-center py-16">
            <h2 className="text-2xl font-bold mb-4">Get updates</h2>
            <p className="mb-6 opacity-80">
              Sign up for launch announcements and feature updates.
            </p>
            <Newsletter />
          </div>

          <div className="divider my-0" />

          <div className="py-8">
            <footer className="footer sm:footer-horizontal text-sm">
              <nav>
                <span className="text-2xl leading-none mb-4" aria-hidden>
                  {SITE_CONFIG.ICON}
                </span>
                <span className="font-medium opacity-80 mb-2">
                  {SITE_CONFIG.TAGLINE}
                </span>
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
                  >
                    <TwitterIcon className="h-5 w-5" />
                  </Link>
                </div>
              </nav>
              <nav>
                <Link
                  href="/account-discovery"
                  className="footer-title link link-hover"
                >
                  Features
                </Link>
                {props.featureNavLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="link link-hover"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <nav>
                <Link
                  href="/resources"
                  className="footer-title link link-hover"
                >
                  Resources
                </Link>
                {props.resourceNavLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="link link-hover"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <nav>
                <Link href="/guides" className="footer-title link link-hover">
                  Guides
                </Link>
                {props.guideNavLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="link link-hover"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <nav>
                <h6 className="footer-title">Legal</h6>
                <Link href="/pricing" className="link link-hover">
                  Pricing
                </Link>
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
  );
}
