import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FileText,
  History,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SITE_CONFIG } from "@/utils/config";
import { RESOURCE_NAV_LINKS } from "@/utils/nav";

export const metadata: Metadata = {
  title: "Resources & Tools",
  description:
    "Explore privacy guides, GDPR request tools, data protection authority contacts, and breach resources.",
  openGraph: {
    title: "Resources & Tools",
    description:
      "Explore privacy guides, GDPR request tools, data protection authority contacts, and breach resources.",
    url: `${SITE_CONFIG.URL}/resources`,
  },
};

interface ResourceCard {
  title: string;
  description: string;
  href: string;
  cta: string;
  tag: string;
  cardClassName: string;
  iconClassName: string;
  badgeClassName: string;
  icon: ReactNode;
}

export default function Page() {
  const cardMap: Record<string, ResourceCard> = {
    "/breaches": {
      title: "Data Breach Overview",
      description:
        "Browse recent breach pages with context on exposure, likely impact, and recommended next steps.",
      href: "/breaches",
      cta: "View breaches",
      tag: "Data Breaches",
      cardClassName: "border-warning/30 hover:border-warning/55",
      iconClassName: "bg-warning/20 text-warning",
      badgeClassName: "badge-warning badge-soft",
      icon: <TriangleAlert className="h-5 w-5" />,
    },
    "/resources/gdpr-generator": {
      title: "GDPR Request Generator",
      description:
        "Generate ready-to-send access and deletion request emails with a structured, guided form.",
      href: "/resources/gdpr-generator",
      cta: "Open generator",
      tag: "Resources",
      cardClassName: "border-success/25 hover:border-success/50",
      iconClassName: "bg-success/15 text-success",
      badgeClassName: "badge-success badge-soft",
      icon: <FileText className="h-5 w-5" />,
    },
    "/guides/how-to-exercise-your-gdpr-rights": {
      title: "Guide: Exercise Your GDPR Rights",
      description:
        "Understand what you can ask for, when deletion applies, and when anonymization is the better request.",
      href: "/guides/how-to-exercise-your-gdpr-rights",
      cta: "Read guide",
      tag: "Guides",
      cardClassName: "border-primary/30 hover:border-primary/55",
      iconClassName: "bg-primary/20 text-primary",
      badgeClassName: "badge-primary badge-soft",
      icon: <BookOpen className="h-5 w-5" />,
    },
    "/resources/authorities": {
      title: "Data Protection Authorities",
      description:
        "Find contact details for national data protection authorities and escalation paths for complaints.",
      href: "/resources/authorities",
      cta: "Browse authorities",
      tag: "Resources",
      cardClassName: "border-info/25 hover:border-info/50",
      iconClassName: "bg-info/15 text-info",
      badgeClassName: "badge-info badge-soft",
      icon: <Shield className="h-5 w-5" />,
    },
    "/changelog": {
      title: "Changelog",
      description:
        "Track release notes, recent product updates, and improvements shipped across the project.",
      href: "/changelog",
      cta: "Read changelog",
      tag: "Resources",
      cardClassName: "border-secondary/25 hover:border-secondary/50",
      iconClassName: "bg-secondary/15 text-secondary",
      badgeClassName: "badge-secondary badge-soft",
      icon: <History className="h-5 w-5" />,
    },
  };

  const cards: ResourceCard[] = [
    ...RESOURCE_NAV_LINKS.filter((link) => link.href !== "/resources")
      .map((link) => cardMap[link.href])
      .filter((card): card is ResourceCard => Boolean(card)),
  ];

  const fallbackCards: ResourceCard[] = [
    {
      title: "Guide: Exercise Your GDPR Rights",
      description:
        "Understand what you can ask for, when deletion applies, and when anonymization is the better request.",
      href: "/guides/how-to-exercise-your-gdpr-rights",
      cta: "Read guide",
      tag: "Guides",
      cardClassName: "border-primary/30 hover:border-primary/55",
      iconClassName: "bg-primary/20 text-primary",
      badgeClassName: "badge-primary badge-soft",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      title: "GDPR Request Generator",
      description:
        "Generate ready-to-send access and deletion request emails with a structured, guided form.",
      href: "/resources/gdpr-generator",
      cta: "Open generator",
      tag: "Resources",
      cardClassName: "border-success/25 hover:border-success/50",
      iconClassName: "bg-success/15 text-success",
      badgeClassName: "badge-success badge-soft",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      title: "Data Protection Authorities",
      description:
        "Find contact details for national data protection authorities and escalation paths for complaints.",
      href: "/resources/authorities",
      cta: "Browse authorities",
      tag: "Resources",
      cardClassName: "border-info/25 hover:border-info/50",
      iconClassName: "bg-info/15 text-info",
      badgeClassName: "badge-info badge-soft",
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: "Changelog",
      description:
        "Track release notes, recent product updates, and improvements shipped across the project.",
      href: "/changelog",
      cta: "Read changelog",
      tag: "Resources",
      cardClassName: "border-secondary/25 hover:border-secondary/50",
      iconClassName: "bg-secondary/15 text-secondary",
      badgeClassName: "badge-secondary badge-soft",
      icon: <History className="h-5 w-5" />,
    },
    {
      title: "Data Breach Overview",
      description:
        "Browse recent breach pages with context on exposure, likely impact, and recommended next steps.",
      href: "/breaches",
      cta: "View breaches",
      tag: "Data Breaches",
      cardClassName: "border-warning/30 hover:border-warning/55",
      iconClassName: "bg-warning/20 text-warning",
      badgeClassName: "badge-warning badge-soft",
      icon: <TriangleAlert className="h-5 w-5" />,
    },
  ];

  return (
    <section className="container mx-auto px-4 py-12">
      <SubpageHeader label="Resources" title="Resources & Tools" />

      <div className="mt-4 max-w-4xl space-y-2 opacity-80">
        <p>
          Use these resources to understand your rights, send GDPR requests, and take action after
          a breach. Everything here is focused on practical next steps.
        </p>
      </div>

      <div className="divider" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(cards.length > 0 ? cards : fallbackCards).map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`card h-full border bg-base-300 shadow-lg transition-colors ${card.cardClassName}`}
          >
            <div className="card-body gap-4">
              <div className="flex items-start justify-between gap-3">
                <span className={`badge badge-sm ${card.badgeClassName}`}>{card.tag}</span>
                <span className={`rounded-lg p-2 ${card.iconClassName}`}>{card.icon}</span>
              </div>
              <div className="space-y-2">
                <h2 className="card-title text-xl">{card.title}</h2>
                <p className="opacity-80">{card.description}</p>
              </div>
              <div className="mt-auto pt-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium opacity-85">
                  {card.cta}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
