import { iconArtwork, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Guides.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOg({
    title: "Guides",
    eyebrow: OG_EYEBROWS.guides,
    artwork: await iconArtwork("book-open"),
  });
}
