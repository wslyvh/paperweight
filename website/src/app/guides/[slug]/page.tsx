import type { Metadata } from "next";
import Link from "next/link";
import dayjs from "dayjs";
import { TakeActionCards } from "@/components/TakeActionCards";
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

  return (
    <section className="container mx-auto px-4 py-12">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="badge badge-primary badge-soft tracking-wider">Guides</p>
          <Link
            href="/guides"
            className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
          >
            ← All guides
          </Link>
        </div>
        <h1 className="text-4xl font-bold">{guide.title}</h1>
        {guide.description ? (
          <p className="text-base leading-relaxed opacity-85">{guide.description}</p>
        ) : null}
        <p className="text-sm opacity-70">Last updated: {lastUpdated}</p>
      </header>

      <article
        className="prose prose-sm mt-8 max-w-none md:prose-base"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <div className="divider" />
      <TakeActionCards />
    </section>
  );
}
