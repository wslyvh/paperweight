import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SITE_CONFIG } from "@/utils/config";
import { IRL_CONFIG } from "@/utils/irl";
import { buildMetadata } from "@/utils/seo";
import { jetbrainsMono } from "./fonts";

const IRL_TITLE = `Live at ${IRL_CONFIG.EVENT_LABEL}`;
const IRL_DESCRIPTION =
  `Who knows you're here? See what your RSVP shared, with whom, and what to do about it. Live at ${IRL_CONFIG.EVENT_LABEL}.`;

export const metadata: Metadata = {
  ...buildMetadata({
    title: IRL_TITLE,
    description: IRL_DESCRIPTION,
    path: "/irl",
    image: "/irl-og.png",
    imageAlt: "Paperweight field notes",
  }),
  robots: {
    index: false,
    follow: false,
  },
};

export default function IrlLayout(props: PropsWithChildren) {
  if (!IRL_CONFIG.EVENT_ACTIVE) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-base-100">
      <div className="mx-auto max-w-2xl px-5 py-6 pb-12">
        <header className={`mb-8 ${jetbrainsMono.className}`}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-xl">{SITE_CONFIG.ICON}</span>
            <span className="text-lg font-bold">{SITE_CONFIG.NAME}</span>
          </Link>
          <p className="mt-5 text-[0.7rem] uppercase tracking-widest text-accent">
            Field notes // {IRL_CONFIG.EVENT_LABEL}
          </p>
        </header>

        {props.children}

        <footer className="mt-12 flex items-center justify-between gap-4 border-t border-base-content/15 pt-5 text-xs opacity-70">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{SITE_CONFIG.NAME}</span>
            <span className="opacity-40" aria-hidden>·</span>
            <Link
              href={SITE_CONFIG.GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-hover"
            >
              GitHub
            </Link>
          </div>
          <Link href="/privacy" className="link link-hover">
            Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}
