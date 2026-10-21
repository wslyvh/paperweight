import { iconArtwork, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Resources & tools.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOg({
    title: "Resources & tools",
    eyebrow: OG_EYEBROWS.resources,
    artwork: await iconArtwork("layout-grid"),
  });
}
