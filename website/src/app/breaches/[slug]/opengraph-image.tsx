import { notFound } from "next/navigation";
import { breachArtwork } from "@/components/og/BreachArtwork";
import { getBreachPageModel } from "@/utils/breach";
import { getBreachBySlug, getBreachSlugs } from "@/utils/content";
import { OG_COLORS, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight data breach details";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return getBreachSlugs().map((slug) => ({ slug }));
}

interface BreachImageProps {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: BreachImageProps) {
  const { slug } = await params;
  const model = getBreachPageModel(slug);
  const breach = getBreachBySlug(slug);
  if (!model || !breach) notFound();

  return renderOg({
    title: [breach.title, "data breach"],
    eyebrow: OG_EYEBROWS.breaches,
    color: OG_COLORS.error,
    artwork: await breachArtwork(model),
  });
}
