import dayjs from "dayjs";
import type { Dpa } from "@shared/gdpr/types";
import { EU_DPAS, NON_EU_DPAS } from "@shared/gdpr/resolution";
import { AlertTriangle } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import Link from "next/link";

export const AUTHORITIES_LAST_UPDATED = "2026-04-02";

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  valueTitle?: string;
}

function InfoRow({ label, value, valueClassName, valueTitle }: InfoRowProps) {
  return (
    <div className="grid grid-cols-[70px_1fr] items-start gap-2 text-sm">
      <span className="font-mono text-xs uppercase tracking-wide opacity-60 leading-6">
        {label}
      </span>
      <span
        title={valueTitle}
        className={`opacity-80 leading-6 break-words min-w-0 block ${valueClassName ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

interface DpaCardProps {
  dpa: Dpa;
}

function DpaCard({ dpa }: DpaCardProps) {
  return (
    <article className="card flex h-full flex-col bg-base-200/50">
      <div className="card-body flex flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="text-2xl leading-none shrink-0">{dpa.flag}</span>
            <div className="min-w-0">
              <h2 className="card-title text-lg leading-tight">{dpa.country}</h2>
              <p className="mt-1 text-sm opacity-70 line-clamp-2 min-h-[2.5rem] leading-snug">
                {dpa.dpaName}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {dpa.warning ? (
              <div className="dropdown dropdown-end dropdown-top">
                <button
                  type="button"
                  className="badge badge-sm badge-soft badge-warning inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 font-normal"
                  aria-label={`Local rules for ${dpa.country}`}
                  aria-haspopup="dialog"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" />
                  Local rules
                </button>
                <div
                  tabIndex={0}
                  role="dialog"
                  aria-label={`Local rules for ${dpa.country}`}
                  className="dropdown-content mb-2 w-[min(20rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-box border border-warning/25 bg-base-100 p-4 shadow-xl outline-none"
                >
                  <p className="text-xs font-mono uppercase tracking-wide text-warning">
                    Local rules apply
                  </p>
                  <p className="mt-2 text-sm leading-relaxed opacity-90">
                    {dpa.warning}
                  </p>
                </div>
              </div>
            ) : null}
            {dpa.englishOk ? (
              <span className="badge badge-sm badge-soft badge-secondary">
                English
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <InfoRow label="Phone" value={dpa.phone} />
          <InfoRow
            label="Email"
            value={
              dpa.email ? (
                <a href={`mailto:${dpa.email}`} className="link">
                  {dpa.email}
                </a>
              ) : (
                <span className="opacity-50">Not listed</span>
              )
            }
          />
          <InfoRow
            label="Address"
            value={dpa.address}
            valueClassName="line-clamp-3"
            valueTitle={dpa.address}
          />
        </div>

        <div className="card-actions mt-auto justify-start pt-2">
          <a
            href={dpa.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-primary"
          >
            Website
          </a>
          <a
            href={dpa.complaintUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-soft"
          >
            File complaint
          </a>
        </div>
      </div>
    </article>
  );
}

export default function AuthoritiesPage() {
  return (
    <section className="container mx-auto px-4 py-12">
      <SubpageHeader label="Resources" title="Data Protection Authorities" />
      <div className="mt-4 max-w-4xl space-y-4 opacity-85">
        <p>
          Every EU and EEA country has a national data protection authority (DPA)
          responsible for upholding GDPR rights. Most people only think of DPAs as a last resort for formal complaints,
          but they're also a useful first stop for questions and guidance.
          Many publish practical guides, run advice lines, help resolve disputes, or investigate organizations that fail to comply.
        </p>
        <p>
          If you have sent a <Link href="/resources/gdpr-generator" className="link">request</Link>, waited, followed up, and still received
          no satisfactory response, contacting your national DPA is a reasonable next step.
          It is free, and the organization is required to cooperate with any
          investigation. Find your national DPA in our below.
        </p>
      </div>

      <div className="divider" />

      <section className="space-y-4">
        <h2 className="text-sm font-mono uppercase tracking-wider opacity-70">
          EU Member States
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          {EU_DPAS.map((dpa) => (
            <DpaCard key={dpa.country} dpa={dpa} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-sm font-mono uppercase tracking-wider opacity-70">
          Non-EU (Own Legislation)
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          {NON_EU_DPAS.map((dpa) => (
            <DpaCard key={dpa.country} dpa={dpa} />
          ))}
        </div>
      </section>

      <div className="divider" />

      <div className="card bg-base-200/50">
        <div className="card-body text-sm max-w-4xl">

          <p>
            National DPAs are independent of the EU Commission. The{" "}
            <a
              href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              European Data Protection Board
            </a>{" "}
            coordinates between them and publishes guidelines on how GDPR applies
            across borders.
          </p>
        </div>
      </div>
    </section>
  );
}
