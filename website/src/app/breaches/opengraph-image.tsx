import {
  iconArtwork,
  OG_COLORS,
  OG_EYEBROWS,
  OG_SIZE,
  renderOg,
} from "@/utils/og";

export const alt = "Paperweight. Data breaches.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOg({
    title: "Data breaches",
    eyebrow: OG_EYEBROWS.breaches,
    color: OG_COLORS.error,
    artwork: await iconArtwork("triangle-alert"),
  });
}
