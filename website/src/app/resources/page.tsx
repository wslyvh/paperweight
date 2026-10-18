import { FileText, History, Shield, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import {
  ComparisonResources,
  type ResourceCard,
  ResourceCards,
} from "@/components/ComparisonResources";
import { SubpageHeader } from "@/components/SubpageHeader";
import { RESOURCE_NAV_LINKS } from "@/utils/nav";
import { buildMetadata } from "@/utils/seo";

export const metadata: Metadata = buildMetadata({
  title: "Resources & Tools",
  description:
    "GDPR request tools, data protection authority contacts, breach overviews, and other practical privacy resources.",
  path: "/resources",
});

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

  const cards: ResourceCard[] = RESOURCE_NAV_LINKS.map(
    (link) => cardMap[link.href],
  ).filter((card): card is ResourceCard => Boolean(card));

  return (
    <section className="container mx-auto px-4 py-12">
      <SubpageHeader label="Resources" title="Resources & Tools" />

      <div className="mt-4 max-w-4xl space-y-2 opacity-80">
        <p>
          Use these resources to understand your rights, send GDPR requests, and
          take action after a breach. Everything here is focused on practical
          next steps.
        </p>
      </div>

      <div className="divider" />

      <ResourceCards cards={cards} />
      <ComparisonResources />
    </section>
  );
}
