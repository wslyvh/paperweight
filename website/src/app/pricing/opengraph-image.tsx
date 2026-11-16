import { OG_COLORS, OG_SIZE, renderOg } from "@/utils/og";
import { BLACK_FRIDAY_ACTIVE } from "@/utils/pricing";

export const alt = BLACK_FRIDAY_ACTIVE
  ? "Limited Black Friday offer. Available until Dec 1. Black Friday 2026."
  : "Paperweight pricing. Free discovery, yearly Pro, and the Cleanup Pass.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: BLACK_FRIDAY_ACTIVE
      ? ["Limited Black", "Friday offer"]
      : ["Start for free.", "Choose your Pro access."],
    eyebrow: BLACK_FRIDAY_ACTIVE
      ? "AVAILABLE UNTIL DEC 1"
      : "PAPERWEIGHT PRICING",
    color: OG_COLORS.accent,
    campaignBadge: BLACK_FRIDAY_ACTIVE ? "BLACK FRIDAY 2026" : undefined,
  });
}
