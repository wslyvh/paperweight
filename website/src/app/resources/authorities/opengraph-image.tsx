import { iconArtwork, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Data Protection Authorities.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOg({
    title: ["Data Protection", "Authorities"],
    eyebrow: OG_EYEBROWS.resources,
    artwork: await iconArtwork("scale"),
  });
}
