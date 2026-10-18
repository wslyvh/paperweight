import { ComparisonResources } from "@/components/ComparisonResources";
import { FeatureFinalCta, FeatureTrustSummary } from "@/components/FeaturePage";
import type { Alternative } from "@/utils/alternatives";
import { SITE_CONFIG } from "@/utils/config";
import { ALTERNATIVES_LAST_UPDATED } from "@/utils/page-dates";

interface AlternativePageProps {
  alternative: Alternative;
}

export function AlternativePage({ alternative }: AlternativePageProps) {
  const title = `${alternative.name} Alternative`;
  const description = alternative.description;
  const path = `/${alternative.slug}`;
  const comparisonRows = alternative.rows;
  const products = [
    {
      name: "Paperweight",
      summary:
        "An open-source desktop app for account discovery, email cleanup, and managing your digital footprint.",
    },
    { name: alternative.name, summary: alternative.summary },
  ];
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${title} | Paperweight`,
      description,
      url: `${SITE_CONFIG.URL}${path}`,
      dateModified: ALTERNATIVES_LAST_UPDATED,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Static JSON-LD constants only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="container mx-auto px-4 pt-16 pb-20">
        <div className="max-w-6xl mx-auto">
          <p className="badge badge-primary badge-soft tracking-wider mb-4">
            Comparison
          </p>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 break-words">
            Alternative to {alternative.name}
          </h1>
          <p className="text-xl opacity-80">{description}</p>
        </div>
      </section>

      <section
        className="container mx-auto px-4 pb-20"
        aria-label="Product comparison"
      >
        <div className="max-w-6xl mx-auto">
          <section
            className="overflow-x-auto rounded-2xl border border-base-300 bg-base-100 focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Scrollable product comparison"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the comparison on narrow screens.
            tabIndex={0}
          >
            <table className="table w-full min-w-2xl table-fixed">
              <caption className="sr-only">
                Paperweight and {alternative.name} compared
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-1/4 align-bottom p-3 md:p-4 text-base-content"
                  >
                    <span className="sr-only">Comparison criteria</span>
                  </th>
                  {products.map((product) => (
                    <th
                      key={product.name}
                      scope="col"
                      className="align-top whitespace-normal break-words p-3 md:p-4"
                    >
                      <span className="block text-lg md:text-2xl font-bold text-base-content mb-3">
                        {product.name}
                      </span>
                      <span className="block text-sm font-normal text-base-content opacity-80">
                        {product.summary}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.dimension}>
                    <th
                      scope="row"
                      className="align-top whitespace-normal p-3 md:p-4"
                    >
                      {row.dimension}
                    </th>
                    {row.values.map((value, index) => (
                      <td
                        key={products[index].name}
                        className="align-top whitespace-normal p-3 md:p-4"
                      >
                        {row.sourceUrl && index === 1 ? (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link link-hover"
                          >
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </section>

      <FeatureTrustSummary heading="What Paperweight does differently" />

      <section className="container mx-auto px-4 pt-8 pb-20">
        <div className="max-w-6xl mx-auto">
          <ComparisonResources />
        </div>
      </section>
      <FeatureFinalCta
        heading="Manage your digital footprint"
        body="Find your accounts, clean up unwanted email, and take control of your personal data."
        primaryAction={{
          href: "/#download",
          label: "Download for free",
          className: "btn btn-primary",
        }}
        secondaryAction={{
          href: "/pricing",
          label: "View pricing",
          className: "btn btn-ghost",
        }}
      />
    </>
  );
}
