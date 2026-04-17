import type { Metadata } from "next";
import Link from "next/link";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SITE_CONFIG } from "@/utils/config";
import { formatCount, getBreachIndexItems } from "@/utils/breach";
import { ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Data Breaches - What to do if your data was exposed",
  description:
    "Guides on recent data breaches. Find out what happened, what data was exposed and what you can do.",
  openGraph: {
    title: "Data Breaches - What to do if your data was exposed",
    description:
      "Guides on recent data breaches. Find out what happened, what data was exposed and what you can do.",
    url: `${SITE_CONFIG.URL}/breaches`,
  },
};

export default function BreachIndexPage() {
  const breaches = getBreachIndexItems("1900-01-01");

  return (
    <section className="container mx-auto px-4 py-12">
      <SubpageHeader label="Data Breaches" title="Data Breaches" />

      <div className="mt-4 max-w-4xl space-y-2 opacity-80">
        <p>
          When companies get breached, millions of people's personal data ends up in the hands of
          criminals. These guides explain what happened, what was exposed, and what you can do.
        </p>
      </div>

      <div className="divider" />

      <div className="space-y-3">
        {breaches.map((breach) => {
          return (
            <Link
              key={breach.slug}
              href={`/breaches/${breach.slug}`}
              className="card bg-base-200/50 hover:bg-base-200 transition-colors cursor-pointer"
            >
              <div className="card-body p-4 flex-row items-center gap-4">

                {breach.logoPath ? (
                  <img
                    src={breach.logoPath}
                    alt={`${breach.title} logo`}
                    className="h-12 w-12 rounded-lg object-contain bg-base-100 p-1.5 shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-base-100 shrink-0" />
                )}

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{breach.title}</span>
                    {breach.categoryLabel ? (
                      <span className="badge badge-xs badge-ghost">{breach.categoryLabel}</span>
                    ) : null}
                    <span
                      className={`badge badge-xs badge-soft ${breach.riskBadgeClass}`}
                    >
                      {breach.riskLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-60">
                    <span>{breach.breachDate.slice(0, 7)}</span>
                    <span>
                      {breach.pwnCount > 0
                        ? `${formatCount(breach.pwnCount)} records`
                        : "Unknown records"}
                    </span>
                    <span className="hidden sm:inline">
                      {breach.dataClasses.slice(0, 3).join(", ")}
                      {breach.dataClasses.length > 3 && ` +${breach.dataClasses.length - 3} more`}
                    </span>
                  </div>
                </div>

                {/* Right side */}
                <div className="shrink-0 flex items-center gap-3">
                  <ChevronRight className="h-4 w-4 opacity-40" />
                </div>

              </div>
            </Link>
          );
        })}
      </div>

      {breaches.length === 0 && (
        <p className="opacity-60 text-sm">No breach pages yet.</p>
      )}
    </section>
  );
}
