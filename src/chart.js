// Rating-over-time chart: pure functions, rendered as inline SVG on the server (no JavaScript).

// Ratings before and after each change, oldest first. deltas are oldest first; the last value is `current`.
// Ratings are clamped to 0–7 when applied, so walking back from the current rating is exact except at the limits.
export function ratingSeries(current, deltas) {
  const series = [current];
  for (let i = deltas.length - 1; i >= 0; i--) series.unshift(series[0] - deltas[i]);
  return series.map((r) => Math.round(r * 1000) / 1000);
}

// Points for an SVG polyline in a width×height box with padding. Keeps the last `max` values.
export function chartPoints(series, { width = 320, height = 120, pad = 8, max = 30 } = {}) {
  const ys = series.slice(-max);
  const lo = Math.max(0, Math.min(...ys) - 0.25);
  const hi = Math.min(7, Math.max(...ys) + 0.25);
  const span = hi - lo || 1;
  const step = ys.length > 1 ? (width - 2 * pad) / (ys.length - 1) : 0;
  const points = ys.map((y, i) => [
    Math.round((pad + i * step) * 10) / 10,
    Math.round((pad + (hi - y) / span * (height - 2 * pad)) * 10) / 10,
  ]);
  return { points, lo, hi };
}
