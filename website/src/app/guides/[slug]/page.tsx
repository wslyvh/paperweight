import dayjs from "dayjs";
import type { Metadata } from "next";
import Link from "next/link";
import { TakeActionCards } from "@/components/TakeActionCards";
import { SITE_CONFIG } from "@/utils/config";
import { GetGuide, GetGuides } from "@/utils/guides";
import { parseMarkdown } from "@/utils/markdown";
import { buildMetadata } from "@/utils/seo";

export function generateStaticParams() {
  return GetGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GetGuide(slug);
  if (!guide) return {};

  return buildMetadata({
    title: guide.title,
    description: guide.description ?? "Guide",
    path: `/guides/${slug}`,
    type: "article",
    hasOwnImage: true,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = GetGuide(slug);

  if (!guide) {
    return (
      <section className="container mx-auto px-4 py-12">
        <p className="opacity-70">Guide not found.</p>
      </section>
    );
  }

  const bodyHtml = await parseMarkdown(guide.body);
  const lastUpdated = dayjs(guide.last_updated).format("MMM D, YYYY");
  const guideUrl = `${SITE_CONFIG.URL}/guides/${guide.slug}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      dateModified: guide.last_updated,
      mainEntityOfPage: guideUrl,
      publisher: {
        "@type": "Organization",
        name: SITE_CONFIG.NAME,
        url: SITE_CONFIG.URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_CONFIG.URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Guides",
          item: `${SITE_CONFIG.URL}/guides`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: guide.title,
          item: guideUrl,
        },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD comes from local guide content and static site configuration.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Next.js requires raw JSON in a script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="container mx-auto px-4 py-12">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="badge badge-primary badge-soft tracking-wider">
              Guides
            </p>
            <Link
              href="/guides"
              className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
            >
              ← All guides
            </Link>
          </div>
          <h1 className="text-4xl font-bold">{guide.title}</h1>
          {guide.description ? (
            <p className="text-base leading-relaxed opacity-85">
              {guide.description}
            </p>
          ) : null}
          <p className="text-sm opacity-70">Last updated: {lastUpdated}</p>
        </header>

        <article
          className="prose prose-sm mt-8 max-w-none md:prose-base"
          // Markdown comes from trusted local guide files.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered Markdown requires raw HTML.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {guide.slug !== "find-online-accounts" ? (
          <>
            <div className="divider" />
            <TakeActionCards />
          </>
        ) : null}
      </section>
    </>
  );
}
