import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getBreachPageModel, formatCount } from "@/utils/breach";
import { getBreachSlugs } from "@/utils/content";

export const alt = "Data Breach Details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getBreachSlugs().map((slug) => ({ slug }));
}

const RISK_COLORS: Record<string, { color: string; border: string; bg: string }> = {
  "badge-error": { color: "#e8a87a", border: "rgba(232,168,122,0.5)", bg: "rgba(232,168,122,0.1)" },
  "badge-warning": { color: "#ddd46d", border: "rgba(221,212,109,0.5)", bg: "rgba(221,212,109,0.1)" },
  "badge-success": { color: "#8bda6e", border: "rgba(139,218,110,0.5)", bg: "rgba(139,218,110,0.1)" },
};

const VERIFIED_STYLE = {
  color: "#6dd0dd",
  border: "rgba(109,208,221,0.5)",
  bg: "rgba(109,208,221,0.1)",
};

const UNVERIFIED_STYLE = {
  color: "rgba(255,255,255,0.45)",
  border: "rgba(255,255,255,0.15)",
  bg: "rgba(255,255,255,0.05)",
};

async function fetchLogo(logoPath: string | undefined): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const res = await fetch(logoPath, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const ct = res.headers.get("content-type") ?? "image/png";
    return `data:${ct};base64,${base64}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = getBreachPageModel(slug);
  const iconData = await readFile(join(process.cwd(), "public", "icon.png"));
  const iconSrc = `data:image/png;base64,${iconData.toString("base64")}`;

  if (!model) {
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
          Paperweight — Data Breaches
        </div>
      ),
      { ...size },
    );
  }

  const logoSrc = await fetchLogo(model.company.logoPath);
  const risk = RISK_COLORS[model.breach.riskBadgeClass] ?? RISK_COLORS["badge-success"];
  const verified = model.breach.isVerified ? VERIFIED_STYLE : UNVERIFIED_STYLE;
  const maxClasses = 5;
  const shownClasses = model.breach.dataClasses.slice(0, maxClasses);
  const extraCount = model.breach.dataClasses.length - maxClasses;
  const exposedText =
    shownClasses.join(", ") + (extraCount > 0 ? `, and ${extraCount} more` : "");

  const breachDate = new Date(model.breach.date + "T00:00:00Z");
  const dateLabel = breachDate.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const tileWidth = 260;

  // SVG icon paths (Lucide-style, 24x24 viewBox)
  const usersIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  const calendarIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );

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
        <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
          {/* Row 1: Data Breach badge */}
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
              Data Breach
            </div>
          </div>

          {/* Row 2: Logo + (Name / Badges) */}
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {logoSrc ? (
              <img
                src={logoSrc}
                width={112}
                height={112}
                style={{
                  borderRadius: "16px",
                  objectFit: "contain",
                  background: "rgba(255,255,255,0.9)",
                  padding: "10px",
                }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "800px",
                }}
              >
                {model.company.name}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                {model.breach.isVerified ? (
                  <div
                    style={{
                      display: "flex",
                      fontSize: 14,
                      color: VERIFIED_STYLE.color,
                      border: `1.5px solid ${VERIFIED_STYLE.border}`,
                      background: VERIFIED_STYLE.bg,
                      borderRadius: "999px",
                      padding: "8px 20px",
                    }}
                  >
                    Verified
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    fontSize: 14,
                    color: risk.color,
                    border: `1.5px solid ${risk.border}`,
                    background: risk.bg,
                    borderRadius: "999px",
                    padding: "8px 20px",
                  }}
                >
                  {model.breach.riskLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Stats tiles */}
          <div style={{ display: "flex", gap: "20px" }}>
            {/* Records */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "16px",
                padding: "22px 32px",
                width: `${tileWidth}px`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {usersIcon}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  Records
                </span>
              </div>
              <div style={{ fontSize: 34, fontWeight: 700 }}>
                {formatCount(model.breach.pwnCount)}
              </div>
            </div>

            {/* Date */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "16px",
                padding: "22px 32px",
                width: `${tileWidth}px`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {calendarIcon}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  Date
                </span>
              </div>
              <div style={{ fontSize: 34, fontWeight: 700 }}>{dateLabel}</div>
            </div>
          </div>

          {/* Row 4: Exposed data */}
          <div
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.5,
              maxWidth: "950px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`Exposed: ${exposedText}`}
          </div>
        </div>

        {/* Footer branding — bottom right */}
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
