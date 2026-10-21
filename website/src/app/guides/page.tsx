import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { GetGuides } from "@/utils/guides";
import { buildMetadata } from "@/utils/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Guides: GDPR, Data Removal & Cleanup",
  description:
    "Take back control of your personal data, guides on GDPR rights, comparing data removal and email cleanup tools, and shrinking your footprint.",
  path: "/guides",
  hasOwnImage: true,
});

export default function Page() {
  const guides = GetGuides();

  return (
    <section className="container mx-auto px-4 py-12">
      <SubpageHeader label="Guides" title="Guides" />

      <div className="mt-4 max-w-4xl space-y-2 opacity-80">
        <p>
          Take back control of your personal data, guides on GDPR rights, comparing data removal and email cleanup tools, and shrinking your footprint.
        </p>
      </div>

      <div className="divider" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="card h-full border border-primary/30 bg-base-300 shadow-lg transition-colors hover:border-primary/55"
          >
            <div className="card-body gap-4">
              <div className="flex items-start justify-between gap-3">
                <span className="badge badge-primary badge-soft badge-sm">Guides</span>
                <span className="rounded-lg bg-primary/20 p-2 text-primary">
                  <BookOpen className="h-5 w-5" />
                </span>
              </div>
              <div className="space-y-2">
                <h2 className="card-title text-xl">{guide.title}</h2>
                <p className="opacity-80">{guide.description}</p>
              </div>
              <div className="mt-auto pt-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium opacity-85">
                  Read guide
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
