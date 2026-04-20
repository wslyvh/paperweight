import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GetGuide, GetGuides } from "@/utils/guides";

export const alt = "GDPR Guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return GetGuides().map((guide) => ({ slug: guide.slug }));
}

function stripMarkdown(input: string) {
  return input
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = GetGuide(slug);
  const iconData = await readFile(join(process.cwd(), "public", "icon.png"));
  const iconSrc = `data:image/png;base64,${iconData.toString("base64")}`;

  if (!guide) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #2b3440 0%, #1a1f27 100%)",
            color: "#c3d4de",
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          Paperweight — Guides
        </div>
      ),
      { ...size },
    );
  }

  const summaryText = stripMarkdown(guide.description ?? guide.body).slice(0, 210);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #2b3440 0%, #1a1f27 100%)",
          color: "#e8ecf0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,218,110,0.07) 0%, transparent 70%)",
          }}
        />

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "42px" }}>
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "#8bda6e",
                border: "1.5px solid rgba(139,218,110,0.4)",
                background: "rgba(139,218,110,0.08)",
                borderRadius: "999px",
                padding: "8px 22px",
              }}
            >
              Guide
            </div>
          </div>

          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.1,
              maxWidth: "1020px",
              overflow: "hidden",
              marginTop: "4px",
            }}
          >
            {guide.title}
          </div>

          <div
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.4,
              maxWidth: "920px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: "6px",
            }}
          >
            {summaryText}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "16px",
          }}
        >
          <img
            src={iconSrc}
            width={52}
            height={52}
            style={{ borderRadius: "10px", objectFit: "contain" }}
          />
          <span
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 600,
            }}
          >
            paperweight.email
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
