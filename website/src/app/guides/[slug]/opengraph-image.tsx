import { notFound } from "next/navigation";
import { GetGuide, GetGuides } from "@/utils/guides";
import { iconArtwork, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight privacy guide";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return GetGuides().map((guide) => ({ slug: guide.slug }));
}

interface GuideImageProps {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: GuideImageProps) {
  const { slug } = await params;
  const guide = GetGuide(slug);
  if (!guide) notFound();

  return renderOg({
    title: guide.title,
    eyebrow: OG_EYEBROWS.guides,
    artwork: await iconArtwork("book-open"),
  });
}
