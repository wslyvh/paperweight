import { unrollMeAlternative as alternative } from "@/utils/alternatives";
import { OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = `Paperweight. Alternative to ${alternative.name}.`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Alternative to", alternative.name],
    eyebrow: OG_EYEBROWS.comparisons,
  });
}
