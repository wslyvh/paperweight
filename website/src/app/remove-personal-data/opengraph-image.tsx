import { OG_COLORS, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Find and remove personal data.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Find and remove", "personal data"],
    eyebrow: OG_EYEBROWS.features,
    color: OG_COLORS.primary,
    badges: OG_COLORS.accent,
    background: "background-remove-personal-data.png",
    screenshot: "features/personal-data.png",
  });
}
