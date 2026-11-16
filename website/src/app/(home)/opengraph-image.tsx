import { OG_SIZE, renderOg } from "@/utils/og";
import { BLACK_FRIDAY_ACTIVE } from "@/utils/pricing";

export const alt = BLACK_FRIDAY_ACTIVE
  ? "Paperweight. Manage your digital footprint. Black Friday 2026."
  : "Paperweight. Manage your digital footprint.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Manage your digital", "footprint"],
    eyebrow: "Your inbox knows where your data lives",
    campaignBadge: BLACK_FRIDAY_ACTIVE ? "BLACK FRIDAY 2026" : undefined,
  });
}
