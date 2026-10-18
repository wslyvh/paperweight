import Link from "next/link";
import { FeatureFinalCta, FeatureTrustSummary } from "@/components/FeaturePage";
import { type Alternative, alternatives } from "@/utils/alternatives";
import { SITE_CONFIG } from "@/utils/config";
import { ALTERNATIVES_LAST_UPDATED } from "@/utils/page-dates";

const benefits = [
  {
    title: "Find your online accounts",
    description:
      "Discover accounts, purchases, and subscriptions from your email history. Review each company and the evidence behind the relationship.",
  },
  {
    title: "Clean up unwanted email",
    description:
      "Manage mailing lists, unsubscribe in bulk, and remove unwanted messages.",
  },
  {
    title: "Take control of your personal data",
    description:
      "Detect personal details in past messages. Generate and send access or deletion requests, then track the response.",
  },
];

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
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_CONFIG.URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Resources",
          item: `${SITE_CONFIG.URL}/resources`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${alternative.name} alternative`,
          item: `${SITE_CONFIG.URL}${path}`,
        },
      ],
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
        <div className="max-w-4xl mx-auto text-center">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm opacity-80">
            <Link href="/" className="link link-hover">
              Home
            </Link>
            <span aria-hidden> / </span>
            <Link href="/resources#alternatives" className="link link-hover">
              Resources
            </Link>
            <span aria-hidden> / </span>
            <span aria-current="page">{alternative.name} alternative</span>
          </nav>
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
        <div className="max-w-5xl mx-auto">
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
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-10">
              What Paperweight does differently
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {benefits.map((benefit) => (
                <div
                  key={benefit.title}
                  className="card bg-base-100 border border-base-300"
                >
                  <div className="card-body">
                    <h3 className="card-title text-lg">{benefit.title}</h3>
                    <p className="text-sm opacity-80">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <nav
        aria-label="Other alternatives"
        className="container mx-auto px-4 py-8"
      >
        <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          {alternatives
            .filter((item) => item.slug !== alternative.slug)
            .map((item) => (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                className="link link-primary"
              >
                {item.name} alternative
              </Link>
            ))}
        </div>
      </nav>
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
