import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_EYEBROWS, OG_SIZE, renderOg } from "@/utils/og";

export const alt = "Paperweight. GDPR request generator.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const screenshot = await readFile(
    join(process.cwd(), "public/og/gdpr-request.png"),
  );
  const width = 440;
  const height =
    (width * screenshot.readUInt32BE(20)) / screenshot.readUInt32BE(16);

  return renderOg({
    title: ["GDPR request", "generator"],
    eyebrow: OG_EYEBROWS.resources,
    artwork: (
      // The source capture has true alpha corners. Do not add another frame.
      // biome-ignore lint/performance/noImgElement: Satori requires plain images.
      <img
        src={`data:image/png;base64,${screenshot.toString("base64")}`}
        width={width}
        height={height}
        alt=""
        style={{
          position: "absolute",
          left: 690,
          top: Math.round((630 - height) / 2),
        }}
      />
    ),
  });
}
