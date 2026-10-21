import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

// DaisyUI Dim: base-content, primary, accent, info, error.
export const OG_COLORS = {
  background: "#1a1f27",
  surface: "#242933",
  raised: "#2a303c",
  content: "#b2ccd6",
  muted: "#7d8a9a",
  primary: "#9fe88d",
  accent: "#c792e9",
  info: "#28ebff",
  error: "#ffae9b",
  warning: "#ddd46d",
};

export const OG_EYEBROWS = {
  features: "Reduce your digital footprint",
  resources: "Practical resources & tools",
  comparisons: "Compare privacy tools",
  guides: "Understand your privacy",
  breaches: "Understand data breaches",
};

export const OG_FONTS = { sans: "Ubuntu", mono: "JetBrains Mono" };
const fontSize = { title: 54, eyebrow: 19, badge: 13, domain: 22 };

interface OgOptions {
  title: string | string[];
  eyebrow: string;
  color?: string;
  badges?: string;
  background?: string;
  /** Screenshot path relative to public/. Uses the shared desktop frame. */
  screenshot?: string;
  /** Custom right-side illustration. Omit to use Moai/radar. */
  artwork?: ReactNode;
}

interface RadarArtworkProps {
  logo: string;
}

function RadarArtwork({ logo }: RadarArtworkProps) {
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
          stroke={OG_COLORS.primary}
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
                  fill={OG_COLORS.primary}
                  stroke="none"
                  opacity="0.85"
                />
              </g>
            );
          })}
        </g>
      </svg>
      {/* biome-ignore lint/performance/noImgElement: Satori requires plain images. */}
      <img
        src={logo}
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

interface AppArtworkProps {
  screenshot: string;
}

function AppArtwork({ screenshot }: AppArtworkProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: 600,
        top: 72,
        width: 900,
        border: "1px solid #53616f",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          position: "relative",
          width: "100%",
          height: 29,
          background: "#282e39",
          borderBottom: "1px solid #333b48",
          paddingLeft: 12,
          gap: 7,
        }}
      >
        {["#ff6058", "#ffbd2e", "#28ca42"].map((color) => (
          <div
            key={color}
            style={{ width: 9, height: 9, borderRadius: 9, background: color }}
          />
        ))}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 8,
            width: "100%",
            justifyContent: "center",
            fontSize: 10,
            color: OG_COLORS.muted,
          }}
        >
          Paperweight
        </div>
      </div>
      {/* biome-ignore lint/performance/noImgElement: Satori requires plain images. */}
      <img src={screenshot} alt="" width={900} height={881} />
    </div>
  );
}

export async function iconArtwork(
  icon: "layout-grid" | "book-open" | "triangle-alert" | "scale",
) {
  const svg = await readFile(
    join(process.cwd(), "public/og/icons", `${icon}.svg`),
  );
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: 710,
        top: 105,
        width: 420,
        height: 420,
        opacity: 0.4,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori requires plain images. */}
      <img
        src={`data:image/svg+xml;base64,${svg.toString("base64")}`}
        width={420}
        height={420}
        alt=""
      />
    </div>
  );
}

export async function renderOg({
  title,
  eyebrow,
  color = OG_COLORS.accent,
  badges = OG_COLORS.primary,
  background = "background.png",
  screenshot,
  artwork,
}: OgOptions) {
  const [regular, medium, mono, logo, backgroundBytes, screenshotBytes] =
    await Promise.all([
      readFile(join(process.cwd(), "public/fonts/Ubuntu-Regular.ttf")),
      readFile(join(process.cwd(), "public/fonts/Ubuntu-Medium.ttf")),
      readFile(join(process.cwd(), "public/fonts/JetBrainsMono-Medium.ttf")),
      readFile(join(process.cwd(), "public/icon.png")),
      readFile(join(process.cwd(), "public/og", background)),
      screenshot
        ? readFile(join(process.cwd(), "public", screenshot))
        : undefined,
    ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: OG_COLORS.background,
        color: OG_COLORS.content,
        fontFamily: OG_FONTS.sans,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori requires plain images. */}
      <img
        src={`data:image/png;base64,${backgroundBytes.toString("base64")}`}
        alt=""
        width={1200}
        height={630}
        style={{ position: "absolute", left: 0, top: 0 }}
      />
      {artwork ??
        (screenshotBytes ? (
          <AppArtwork
            screenshot={`data:image/png;base64,${screenshotBytes.toString("base64")}`}
          />
        ) : (
          <RadarArtwork logo={logoSrc} />
        ))}
      {screenshot || artwork ? (
        // The source icon has transparent padding. This preserves its proportions.
        // biome-ignore lint/performance/noImgElement: Satori requires plain images.
        <img
          src={logoSrc}
          alt=""
          width={58}
          height={58}
          style={{
            position: "absolute",
            left: 64,
            top: 30,
            objectFit: "contain",
          }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 80,
          top: 202,
          width: 520,
          gap: 25,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: OG_FONTS.mono,
            fontSize: fontSize.eyebrow,
            fontWeight: 500,
            lineHeight: 1.2,
            letterSpacing: "0.025em",
            color,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: fontSize.title,
            fontWeight: 500,
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
          }}
        >
          {(Array.isArray(title) ? title : [title]).map((line) => (
            <div key={line} style={{ display: "flex" }}>
              {line}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 80,
          top: 498,
          gap: 17,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          {["local-first", "open-source", "privacy-preserving"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                height: 30,
                padding: "0 11px",
                borderRadius: 999,
                border: `1px solid ${badges}70`,
                background: `${badges}15`,
                color: badges,
                fontFamily: OG_FONTS.mono,
                fontSize: fontSize.badge,
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: fontSize.domain,
            fontWeight: 400,
            lineHeight: 1.2,
            color: OG_COLORS.muted,
          }}
        >
          paperweight.email
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: OG_FONTS.sans, data: regular, weight: 400, style: "normal" },
        { name: OG_FONTS.sans, data: medium, weight: 500, style: "normal" },
        { name: OG_FONTS.mono, data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
