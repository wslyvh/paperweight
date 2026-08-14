import { buildGdprGeneratorInitialState } from "@shared/gdpr/resolution";
import type { GdprRequestAction } from "@shared/gdpr/types";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Generator } from "@/components/Generator";
import { PromoBanner } from "@/components/PromoBanner";
import { SubpageHeader } from "@/components/SubpageHeader";
import companies from "@/data/companies.generated.json";
import { buildMetadata } from "@/utils/seo";

export const metadata = buildMetadata({
  title: "Free GDPR Request Generator",
  description:
    "Generate a ready-to-send GDPR access or deletion request in seconds. Free, private, and tailored to the company holding your data.",
  path: "/resources/gdpr-generator",
});

interface GdprGeneratorPageProps {
  searchParams: Promise<{
    company?: string;
    action?: string;
  }>;
}

export default async function GdprGeneratorPage({
  searchParams,
}: GdprGeneratorPageProps) {
  const query = await searchParams;
  const initialState = buildGdprGeneratorInitialState(companies, query.company);
  const initialAction: GdprRequestAction =
    query.action === "delete" ? "delete" : "access";

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="mx-auto space-y-8">
        <SubpageHeader label="Resources" title="GDPR Request Generator" />
        <div className="max-w-4xl space-y-4 opacity-80">
          <p>
            Use this form to generate a GDPR request. Choose which action you
            want to take (access or delete) and select or enter an organization.
            Add your details on the right. The template is updated directly to
            copy or open in your own email client.
          </p>
          <p>
            More information about your local data protection authority is
            available in our{" "}
            <Link href="/resources/authorities" className="link">
              DPA directory
            </Link>
            .
          </p>
        </div>

        <Generator initialState={initialState} initialAction={initialAction} />

        <PromoBanner
          className="mt-24"
          icon={<Sparkles className="h-5 w-5" strokeWidth={1.75} />}
          title="Do this automatically with Paperweight"
          description="Paperweight scans your inbox to find every company that has your data, and helps you send deletion requests, unsubscribe from mailing lists, and clean up your digital footprint in one place."
          href="/#download"
          actionLabel="Download Paperweight"
        />
      </div>
    </section>
  );
}
