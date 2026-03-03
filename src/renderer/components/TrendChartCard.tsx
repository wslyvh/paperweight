import type { ChartTrend } from "@shared/types";
import { computeTrend } from "@shared/math";
import { Line, LineChart, ResponsiveContainer, XAxis } from "recharts";
import { formatUtcStrictDate } from "@shared/formatting";

export interface TrendChartProps {
  title: string;
  description?: string;
  height?: number;
  trendDirection?: "down" | "up";
  trend: ChartTrend;
}

export default function TrendChart({
  trend,
  title,
  description,
  height = 240,
  trendDirection,
}: TrendChartProps) {
  const t = computeTrend(trend.series[0]?.values ?? [], 7);

  const badgeText =
    t.direction === "flat"
      ? "— same"
      : `${t.direction === "down" ? "↓" : "↑"} ${t.pct}% vs prior`;

  const badgeClass = (() => {
    if (t.direction === "flat") return "badge-ghost";
    const isGood = t.direction === trendDirection;
    return isGood ? "badge-success" : "badge-error";
  })();

  return (
    <div className="card bg-base-200">
      <div className="card-body gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="card-title">{title}</h2>
            {description && (
              <p className="text-sm text-base-content/60">{description}</p>
            )}
          </div>

          {trendDirection && (
            <span className={`badge badge-xs badge-soft ${badgeClass}`}>
              {badgeText}
            </span>
          )}
        </div>

        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trend.labels.map((label, i) => ({
                label,
                value: trend.series[0]?.values?.[i] ?? 0,
              }))}
            >
              <XAxis
                dataKey="label"
                tickFormatter={(label) => formatUtcStrictDate(label, "MMM D")}
                interval="preserveStartEnd"
                minTickGap={30}
                tickMargin={12}
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                tickLine={false}
                axisLine={false}
              />

              <Line
                type="linear"
                dataKey="value"
                dot={false}
                className="text-info"
                stroke="currentColor"
                strokeWidth={2}
                activeDot={(p) => {
                  if (p.cx === undefined || p.cy === undefined) return null;
                  return (
                    <circle
                      className="text-info"
                      cx={p.cx}
                      cy={p.cy}
                      r={3}
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
