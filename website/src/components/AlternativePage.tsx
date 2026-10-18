import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CoreFeatureCards } from "@/components/CoreFeatureCards";
import { FeatureFinalCta, FeatureTrustSummary } from "@/components/FeaturePage";
import { type Alternative, alternatives } from "@/utils/alternatives";
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
                    className="w-1/4 align-bottom text-base-content"
                  >
                    Feature
                  </th>
                  {products.map((product) => (
                    <th
                      key={product.name}
                      scope="col"
                      className="align-top whitespace-normal break-words p-3 md:p-6"
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
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </section>

      <section className="bg-base-200 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold mb-10">
              What Paperweight does differently
            </h2>
            <CoreFeatureCards />
          </div>
        </div>
      </section>

      <section
        className="container mx-auto px-4 py-20"
        aria-labelledby="other-comparisons"
      >
        <div className="max-w-6xl mx-auto">
          <h2 id="other-comparisons" className="text-3xl font-bold mb-10">
            Compare Paperweight against others
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ...alternatives
                .filter((item) => item.slug !== alternative.slug)
                .map((item) => ({
                  href: `/${item.slug}`,
                  title: `Alternative to ${item.name}`,
                  description: item.description,
                })),
              {
                href: "/resources#alternatives",
                title: "All comparisons",
                description:
                  "Explore Paperweight alternatives to email cleanup and privacy tools.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
              >
                <div className="card-body">
                  <h3 className="card-title text-lg">{item.title}</h3>
                  <p className="text-sm opacity-80">{item.description}</p>
                  <span className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium">
                    View comparison
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <FeatureTrustSummary />
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
