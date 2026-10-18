import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { alternatives } from "@/utils/alternatives";

export interface ResourceCard {
  title: string;
  description: string;
  href: string;
  cta: string;
  tag: string;
  cardClassName: string;
  iconClassName: string;
  badgeClassName: string;
  icon: ReactNode;
}

interface ResourceCardsProps {
  cards: ResourceCard[];
  nested?: boolean;
}

export function ResourceCards({ cards, nested = false }: ResourceCardsProps) {
  const Heading = nested ? "h3" : "h2";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className={`card h-full border bg-base-300 shadow-lg transition-colors ${card.cardClassName}`}
        >
          <div className="card-body gap-4">
            <div className="flex items-start justify-between gap-3">
              <span className={`badge badge-sm ${card.badgeClassName}`}>
                {card.tag}
              </span>
              <span className={`rounded-lg p-2 ${card.iconClassName}`}>
                {card.icon}
              </span>
            </div>
            <div className="space-y-2">
              <Heading className="card-title text-xl">{card.title}</Heading>
              <p className="opacity-80">{card.description}</p>
            </div>
            <div className="mt-auto pt-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium opacity-85">
                {card.cta}
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

const comparisonCards: ResourceCard[] = alternatives.map((alternative) => ({
  title: `Alternative to ${alternative.name}`,
  description: alternative.description,
  href: `/${alternative.slug}`,
  cta: `Compare with ${alternative.name}`,
  tag: "Comparison",
  cardClassName: "border-primary/25 hover:border-primary/50",
  iconClassName: "bg-primary/15 text-primary",
  badgeClassName: "badge-primary badge-soft",
  icon: <ArrowRight className="h-5 w-5" />,
}));

export function ComparisonResources() {
  return (
    <section
      id="alternatives"
      className="mt-12 scroll-mt-8"
      aria-labelledby="alternatives-title"
    >
      <h2 id="alternatives-title" className="text-3xl font-bold">
        Alternatives
      </h2>
      <p className="mt-4 opacity-80">
        Compare Paperweight with other email cleanup and privacy tools.
      </p>
      <div className="divider" />
      <ResourceCards cards={comparisonCards} nested />
    </section>
  );
}
