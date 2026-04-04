import { SubpageHeader } from "@/components/SubpageHeader";
import { Generator } from "@/components/Generator";
import Link from "next/link";

export const GDPR_GENERATOR_LAST_UPDATED = "2026-04-02";

export default function GdprGeneratorPage() {
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

        <Generator />

        <div className="card bg-base-300 mt-24">
          <div className="card-body">
            <h2 className="card-title">Do this automatically with Paperweight</h2>
            <p className="opacity-80 max-w-4xl">
              Paperweight scans your inbox to find every company that has your
              data, and helps you send deletion requests, unsubscribe from
              mailing lists, and clean up your digital footprint in one place.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <Link href="/#download" className="btn btn-sm btn-primary">
                Download
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
