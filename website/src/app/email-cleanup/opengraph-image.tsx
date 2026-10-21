import { OG_COLORS, OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Unsubscribe from unwanted emails.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Unsubscribe from", "unwanted emails"],
    eyebrow: OG_EYEBROWS.features,
    color: OG_COLORS.error,
    background: "background-email-cleanup.png",
    screenshot: "features/mailing.png",
  });
}
