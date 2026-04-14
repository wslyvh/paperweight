import { SubpageHeader } from "@/components/SubpageHeader";
import { Generator } from "@/components/Generator";
import { buildGdprGeneratorInitialState } from "@shared/gdpr/resolution";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import companies from "@/data/companies.generated.json";

export const GDPR_GENERATOR_LAST_UPDATED = "2026-04-02";

interface GdprGeneratorPageProps {
  searchParams: Promise<{
    company?: string;
  }>;
}

export default async function GdprGeneratorPage({
  searchParams,
}: GdprGeneratorPageProps) {
  const query = await searchParams;
  const initialState = buildGdprGeneratorInitialState(
    companies,
    query.company,
  );

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="mx-auto space-y-8">
        <SubpageHeader label="Resources" title="GDPR Request Generator" />
        <div className="max-w-4xl space-y-4 opacity-80">
          <p>
            Use this form to generate a GDPR request. Choose which action you
            want to take (access or delete) and select or enter an
            organization. Add your details on the right. The template is
            updated directly to copy or open in your own email client.
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

        <Generator initialState={initialState} />

        <div className="card mt-24 border border-primary/30 bg-base-300 shadow-lg">
          <div className="card-body gap-5 sm:gap-6">
            <div className="flex flex-col gap-5 sm:gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-semibold leading-tight">
                    Do this automatically with Paperweight
                  </h2>
                  <p className="max-w-2xl text-sm opacity-90 sm:text-base">
                    Paperweight scans your inbox to find every company that has
                    your data, and helps you send deletion requests, unsubscribe
                    from mailing lists, and clean up your digital footprint in
                    one place.
                  </p>
                </div>
              </div>
              <Link href="/#download" className="btn btn-primary md:shrink-0">
                Download Paperweight
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
