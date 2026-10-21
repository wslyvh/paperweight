import { OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. Manage your digital footprint.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    title: ["Manage your digital", "footprint"],
    eyebrow: "Your inbox knows where your data lives",
  });
}
