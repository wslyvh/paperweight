export interface NiceAxis {
  max: number;
  ticks: number[];
}

export function niceMax(value: number, tickCount = 5): NiceAxis {
  if (value === 0) {
    const step = 2;
    return {
      max: step * (tickCount - 1),
      ticks: Array.from({ length: tickCount }, (_, i) => i * step),
    };
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const max = niceFraction * magnitude;
  const step = max / (tickCount - 1);
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round(i * step)
  );
  return { max, ticks };
}

export interface Trend {
  direction: "up" | "down" | "flat";
  pct: number;
}

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return sum / nums.length;
}

export function computeTrend(values: number[], period: number = 7): Trend {
  const p = Math.max(1, Math.floor(period));
  if (values.length < 2 * p) return { direction: "flat", pct: 0 };

  const last = values.slice(values.length - p);
  const prev = values.slice(values.length - 2 * p, values.length - p);

  const a1 = average(prev);
  const a2 = average(last);

  if (a1 === 0) {
    if (a2 === 0) return { direction: "flat", pct: 0 };
    return { direction: "up", pct: 100 };
  }

  const pct = Math.round(((a2 - a1) / a1) * 100);
  if (pct === 0) return { direction: "flat", pct: 0 };
  return { direction: pct < 0 ? "down" : "up", pct: Math.abs(pct) };
}
