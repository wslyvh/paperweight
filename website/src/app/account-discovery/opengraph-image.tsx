import { OG_COLORS, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Find accounts linked to your email.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Find accounts linked", "to your email"],
    eyebrow: OG_EYEBROWS.features,
    color: OG_COLORS.info,
    background: "background-account-discovery.png",
    screenshot: "features/accounts-detail.png",
  });
}
