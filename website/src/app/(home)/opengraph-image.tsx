import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Paperweight. Manage your digital footprint.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const colors = {
  content: "#b2ccd6",
  muted: "#7d8a9a",
  green: "#9fe88d",
  purple: "#c792e9",
};

interface RadarArtworkProps {
  moai: string;
}

function RadarArtwork({ moai }: RadarArtworkProps) {
  return (
    <div style={{ display: "flex", position: "absolute", inset: 0 }}>
      <svg
        width="1200"
        height="630"
        viewBox="0 0 1200 630"
        aria-hidden="true"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <g
          transform="translate(1000 315) scale(1.04) translate(-1000 -315)"
          fill="none"
          stroke={colors.green}
          strokeOpacity="0.12"
          strokeWidth="2"
        >
          {[132, 190, 248].map((radius) => (
            <circle key={radius} cx="1000" cy="315" r={radius} />
          ))}
          {[-45, 45, 135, 225].map((degrees) => {
            const angle = (degrees * Math.PI) / 180;
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            const dotX = 1000 + 248 * x;
            const dotY = 315 + 248 * y;
            return (
              <g key={degrees}>
                <line
                  x1={1000 + 132 * x}
                  y1={315 + 132 * y}
                  x2={dotX}
                  y2={dotY}
                />
                <circle
                  cx={dotX}
                  cy={dotY}
                  r="4"
                  fill={colors.green}
                  stroke="none"
                  opacity="0.85"
                />
              </g>
            );
          })}
        </g>
      </svg>
      {/* biome-ignore lint/performance/noImgElement: Satori requires a plain img element. */}
      <img
        src={moai}
        alt=""
        width={378}
        height={406}
        style={{
          position: "absolute",
          left: 810,
          top: 112,
          objectFit: "contain",
        }}
      />
    </div>
  );
}

export default async function Image() {
  const [ubuntuRegular, ubuntuMedium, monoMedium, moaiBytes, backgroundBytes] =
    await Promise.all([
      readFile(join(process.cwd(), "public/og-assets/Ubuntu-Regular.ttf")),
      readFile(join(process.cwd(), "public/og-assets/Ubuntu-Medium.ttf")),
      readFile(
        join(process.cwd(), "public/og-assets/JetBrainsMono-Medium.ttf"),
      ),
      readFile(join(process.cwd(), "public/og-assets/moai.png")),
      readFile(join(process.cwd(), "public/og-assets/background.png")),
    ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#1a1f27",
        color: colors.content,
        fontFamily: "Ubuntu",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori requires a plain img element. */}
      <img
        src={`data:image/png;base64,${backgroundBytes.toString("base64")}`}
        alt=""
        width={1200}
        height={630}
        style={{ position: "absolute", left: 0, top: 0 }}
      />
      <RadarArtwork
        moai={`data:image/png;base64,${moaiBytes.toString("base64")}`}
      />
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 159,
          width: 610,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "JetBrains Mono",
            fontSize: 26,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "0.08em",
            color: colors.green,
          }}
        >
          PAPERWEIGHT
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 59,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>
            Manage your digital
          </div>
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>footprint</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 80,
          top: 482,
          fontSize: 22,
          fontWeight: 400,
          lineHeight: 1.25,
          color: colors.purple,
        }}
      >
        Your inbox knows where your data lives
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 80,
          top: 532,
          fontFamily: "JetBrains Mono",
          fontSize: 17,
          fontWeight: 500,
          lineHeight: 1.2,
          color: colors.muted,
        }}
      >
        Local-first / Open source
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Ubuntu", data: ubuntuRegular, weight: 400, style: "normal" },
        { name: "Ubuntu", data: ubuntuMedium, weight: 500, style: "normal" },
        {
          name: "JetBrains Mono",
          data: monoMedium,
          weight: 500,
          style: "normal",
        },
      ],
    },
  );
}
