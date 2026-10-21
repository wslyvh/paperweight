import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type BreachPageModel, formatCount } from "@/utils/breach";
import { SITE_CONFIG } from "@/utils/config";
import { OG_COLORS, OG_FONTS } from "@/utils/og";

const labelStyle = {
  display: "flex",
  fontFamily: OG_FONTS.mono,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.05em",
  color: OG_COLORS.muted,
} as const;

async function readLogo(path?: string) {
  if (!path) return;
  try {
    const url = new URL(path, SITE_CONFIG.URL);
    if (url.origin === SITE_CONFIG.URL) {
      const bytes = await readFile(join(process.cwd(), "public", url.pathname));
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://haveibeenpwned.com/",
        Accept: "image/png",
      },
    });
    if (!response.ok) return;
    const mime =
      response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!mime.startsWith("image/")) return;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    // A missing external logo must not prevent the incident facts from rendering.
    return;
  }
}

interface PillProps {
  text: string;
  color: string;
}

function Pill({ text, color }: PillProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 29,
        padding: "0 11px",
        borderRadius: 999,
        border: `1px solid ${color}50`,
        background: `${color}10`,
        fontFamily: OG_FONTS.mono,
        fontWeight: 500,
        fontSize: 12,
        color,
        lineHeight: 1,
      }}
    >
      {text}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        flex: 1,
        height: 100,
        gap: 11,
        padding: "18px 18px",
        border: `1px solid ${OG_COLORS.content}14`,
        borderRadius: 12,
        background: OG_COLORS.raised,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          display: "flex",
          fontSize: 31,
          fontWeight: 500,
          color: OG_COLORS.content,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export async function breachArtwork(model: BreachPageModel) {
  const logo = await readLogo(model.company.logoPath);
  // These source wordmarks are white on transparent and need a dark tile.
  const logoBackground = ["charter", "chipsoft", "sysco", "zara"].includes(
    model.slug,
  )
    ? OG_COLORS.raised
    : "#f2f3f5";
  const riskColors: Record<string, string> = {
    "badge-error": OG_COLORS.error,
    "badge-warning": OG_COLORS.warning,
    "badge-success": OG_COLORS.primary,
  };
  const riskColor = riskColors[model.breach.riskBadgeClass] ?? OG_COLORS.muted;
  const shown = model.breach.dataClasses.slice(0, 5);
  const remaining = model.breach.dataClasses.length - shown.length;
  const exposed =
    shown.join(", ") + (remaining > 0 ? `, and ${remaining} more` : "");
  const date = new Date(`${model.breach.date}T00:00:00Z`).toLocaleDateString(
    "en-US",
    {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: 650,
        top: 80,
        width: 490,
        height: 470,
        padding: 26,
        borderRadius: 18,
        border: `1px solid ${OG_COLORS.content}26`,
        background: OG_COLORS.surface,
        gap: 26,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            width: 76,
            height: 76,
            padding: 10,
            borderRadius: 13,
            background: logoBackground,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {logo ? (
            // biome-ignore lint/performance/noImgElement: Satori requires plain images.
            <img
              src={logo}
              width={56}
              height={56}
              style={{ objectFit: "contain" }}
              alt=""
            />
          ) : (
            <div
              style={{ display: "flex", fontSize: 32, color: OG_COLORS.muted }}
            >
              {model.company.name[0]}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 9 }}>
            <Pill
              text={model.breach.isVerified ? "verified" : "unverified"}
              color={model.breach.isVerified ? OG_COLORS.info : OG_COLORS.muted}
            />
            <Pill
              text={model.breach.riskLabel.toLowerCase()}
              color={riskColor}
            />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontWeight: 400,
              color: OG_COLORS.muted,
            }}
          >
            {model.company.domain}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <Metric label="RECORDS" value={formatCount(model.breach.pwnCount)} />
        <Metric label="BREACH DATE" value={date} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={labelStyle}>EXPOSED DATA</div>
        <div
          style={{
            display: "flex",
            fontSize: 19,
            fontWeight: 400,
            lineHeight: 1.45,
            color: OG_COLORS.content,
          }}
        >
          {exposed}
        </div>
      </div>
    </div>
  );
}
