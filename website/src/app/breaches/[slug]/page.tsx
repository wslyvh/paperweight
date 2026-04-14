import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { marked } from "marked";
import { Download, ExternalLink, Shield } from "lucide-react";
import { formatCount, formatFine, getBreachPageModel } from "@/utils/breach";
import { getBreachSlugs } from "@/utils/content";
import { SITE_CONFIG } from "@/utils/config";

interface InfoRowProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  valueTitle?: string;
}

function InfoRow({ label, value, valueClassName, valueTitle }: InfoRowProps) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-2 text-sm">
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

export function generateStaticParams() {
  return getBreachSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const model = getBreachPageModel(slug);
  if (!model) return {};

  const { title, description } = model.metadata;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_CONFIG.URL}/breaches/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function BreachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = getBreachPageModel(slug);
  if (!model) {
    return <p>Breach page not found.</p>;
  }

  const breachOverviewHtml = await marked.parse(model.content.incidentAndExposure);
  const timelineAndCauseHtml = model.content.timelineAndCause
    ? await marked.parse(model.content.timelineAndCause)
    : undefined;
  const nextStepsHtml = await marked.parse(model.content.nextSteps);
  const enforcementHtml = model.content.enforcementNarrative
    ? await marked.parse(model.content.enforcementNarrative)
    : undefined;

  return (
    <section className="container mx-auto px-4 py-12">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="badge badge-primary badge-soft tracking-wider">Data Breaches</p>
          <Link
            href="/breaches"
            className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Breach overview
          </Link>
        </div>
        <div className="flex items-start gap-4">
          {model.company.logoPath && (
            <img
              src={model.company.logoPath}
              alt={`${model.company.name} logo`}
              className="h-28 w-28 rounded-xl object-contain bg-base-200 p-2"
              loading="lazy"
            />
          )}
          <div className="min-w-0 space-y-2">
            <h1 className="text-4xl font-bold">{model.company.name}</h1>
            {model.company.website ? (
              <a
                href={model.company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm opacity-65 hover:opacity-90 transition-opacity"
              >
                {model.company.domain}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-sm opacity-65">{model.company.domain}</span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {model.company.categoryLabel && (
                <span className={`badge badge-sm badge-soft ${model.breach.riskBadgeClass}`}>
                  {model.company.categoryIcon ? <span>{model.company.categoryIcon}</span> : null}
                  {model.company.categoryLabel}
                </span>
              )}
              {model.company.runs.map((alias) => (
                <span key={alias} className="badge badge-ghost badge-sm opacity-60">
                  {alias}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-base leading-relaxed opacity-85">{model.company.about}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-14">
        <div className="space-y-8 xl:pr-4">
          {model.content.keyTakeaways && model.content.keyTakeaways.length > 0 ? (
            <section className="card border border-base-300 bg-base-200/50">
              <div className="card-body">
                <h2 className="text-xl font-semibold">Key Takeaways</h2>
                <ul className="mt-1 space-y-2 list-disc pl-5 text-base-content/85">
                  {model.content.keyTakeaways.map((takeaway) => (
                    <li key={takeaway} className="leading-relaxed">
                      {takeaway}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Breach Overview</h2>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: breachOverviewHtml }}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-mono uppercase tracking-wide opacity-70">Exposed Data</h3>
              <div className="flex flex-wrap gap-1.5">
                {model.breach.dataClasses.map((dataClass) => (
                  <span key={dataClass} className="badge badge-sm badge-ghost">
                    {dataClass}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {timelineAndCauseHtml ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Timeline &amp; Cause</h2>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: timelineAndCauseHtml }}
              />
            </section>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Next Steps</h2>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: nextStepsHtml }}
            />
          </section>

          {model.enforcement.records.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">GDPR Enforcement Record</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="opacity-60 text-xs uppercase tracking-wide">
                      <th>Date</th>
                      <th>Authority</th>
                      <th>Fine</th>
                      <th>Violation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.enforcement.records.map((entry) => (
                      <tr key={entry.etid}>
                        <td className="whitespace-nowrap">{entry.decision_date}</td>
                        <td>{entry.authority}</td>
                        <td className="font-mono text-error whitespace-nowrap">
                          {formatFine(entry.fine_eur)}
                        </td>
                        <td className="opacity-70 text-sm">{entry.violation_type ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs opacity-55">
                Source:{" "}
                <a
                  href="https://enforcementtracker.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  enforcementtracker.com
                </a>
              </p>
              {enforcementHtml ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: enforcementHtml }}
                />
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Breach Facts</h2>
            <div className="card bg-base-200/50">
              <div className="card-body p-4 space-y-3">
                <InfoRow label="Date" value={model.breach.date} />
                <InfoRow label="Records" value={`${formatCount(model.breach.pwnCount)} affected`} />
                <InfoRow
                  label="Status"
                  value={
                    <span className="flex flex-wrap items-center gap-2">
                      {model.breach.isVerified && (
                        <span className="badge badge-sm badge-info badge-soft">Verified</span>
                      )}
                      {model.breach.isSensitive ? (
                        <span className="badge badge-sm badge-error badge-soft">Sensitive</span>
                      ) : null}
                      <span className={`badge badge-sm badge-soft ${model.breach.riskBadgeClass}`}>
                        {model.breach.riskLabel}
                      </span>
                    </span>
                  }
                />
                {model.enforcement.totalFines > 0 ? (
                  <InfoRow
                    label="Fines"
                    value={`${formatFine(model.enforcement.totalFines)} total`}
                  />
                ) : null}
                {model.breach.disclosureUrl ? (
                  <div className="card-actions pt-1">
                    <a
                      href={model.breach.disclosureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-primary"
                    >
                      Disclosure statement
                    </a>
                  </div>
                ) : null}
                <p className="text-xs opacity-55">
                  Source:{" "}
                  <a
                    href={model.breach.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    {model.breach.source.name}
                  </a>
                </p>
              </div>
            </div>
          </section>

          {model.dpa ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Data Protection Authority</h2>
              <article className="card bg-base-200/50">
                <div className="card-body gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="text-2xl leading-none shrink-0">{model.dpa.flag}</span>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold leading-tight">{model.dpa.country}</h3>
                        <p className="mt-1 text-sm opacity-70 leading-snug">{model.dpa.dpaName}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <InfoRow label="Phone" value={model.dpa.phone} />
                    <InfoRow
                      label="Email"
                      value={
                        model.dpa.email ? (
                          <a href={`mailto:${model.dpa.email}`} className="link">
                            {model.dpa.email}
                          </a>
                        ) : (
                          <span className="opacity-50">Not listed</span>
                        )
                      }
                    />
                    <InfoRow
                      label="Address"
                      value={model.dpa.address}
                      valueClassName="line-clamp-3"
                      valueTitle={model.dpa.address}
                    />
                  </div>
                  <div className="card-actions pt-2">
                    <a
                      href={model.dpa.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-primary"
                    >
                      Website
                    </a>
                  </div>
                </div>
              </article>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="divider" />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Take Action</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            href={{
              pathname: "/resources/gdpr-generator",
              query: {
                company: model.company.name,
              },
            }}
            className="card border border-primary/30 bg-base-300 shadow-lg transition-colors hover:border-primary/55"
          >
            <div className="card-body gap-4 p-5">
              <p className="font-semibold text-lg leading-tight flex items-center gap-3">
                <span className="shrink-0 rounded-lg bg-primary/20 text-primary p-2">
                  <Shield className="h-5 w-5" />
                </span>
                Generate a GDPR request
              </p>
              <p className="text-sm sm:text-base opacity-90">
                Build a ready-to-send access or deletion request for this company.
              </p>
            </div>
          </Link>
          <Link
            href="/#download"
            className="card border border-info/30 bg-base-300 shadow-lg transition-colors hover:border-info/55"
          >
            <div className="card-body gap-4 p-5">
              <p className="font-semibold text-lg leading-tight flex items-center gap-3">
                <span className="shrink-0 rounded-lg bg-info/20 text-info p-2">
                  <Download className="h-5 w-5" />
                </span>
                Download Paperweight
              </p>
              <p className="text-sm sm:text-base opacity-90">
                Scan your inbox to find other accounts linked to exposed data.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </section>
  );
}
