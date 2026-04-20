import type { Metadata } from "next";
import Link from "next/link";
import { marked } from "marked";
import { TakeActionCards } from "@/components/TakeActionCards";
import { GetGuide, GetGuides } from "@/utils/guides";
import { SITE_CONFIG } from "@/utils/config";

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

  const title = guide.title;
  const description = guide.description ?? "Guide";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_CONFIG.URL}/guides/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
    },
  };
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

  const bodyHtml = await marked.parse(guide.body);

  return (
    <section className="container mx-auto px-4 py-12">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="badge badge-primary badge-soft tracking-wider">Guides</p>
          <Link
            href="/resources"
            className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Resources overview
          </Link>
        </div>
        <h1 className="text-4xl font-bold">{guide.title}</h1>
        {guide.description ? (
          <p className="text-base leading-relaxed opacity-85">{guide.description}</p>
        ) : null}
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
