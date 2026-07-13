/**
 * Temperature → color / commentary / animation mapping.
 *
 * Colors interpolate smoothly through OKLCH so the transition from a calm green
 * to a frantic red has no visible banding. Thresholds follow the brief:
 *   green < 60 °C, amber 60–80 °C, red > 85 °C.
 */

interface Oklch {
  l: number;
  c: number;
  h: number;
}

interface Stop {
  t: number; // temperature °C
  color: Oklch;
}

// Perceptual gradient stops from cool to critical.
const STOPS: Stop[] = [
  { t: 30, color: { l: 0.82, c: 0.16, h: 150 } }, // vivid green
  { t: 55, color: { l: 0.8, c: 0.17, h: 145 } }, // green
  { t: 68, color: { l: 0.82, c: 0.17, h: 95 } }, // yellow-amber
  { t: 78, color: { l: 0.78, c: 0.18, h: 70 } }, // amber
  { t: 85, color: { l: 0.7, c: 0.21, h: 40 } }, // orange-red
  { t: 95, color: { l: 0.62, c: 0.24, h: 25 } }, // red
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothly interpolate a temperature to an OKLCH color string. */
export function tempColor(temp: number | null | undefined): string {
  if (temp == null || Number.isNaN(temp)) return "oklch(0.6 0.02 250)"; // neutral grey
  if (temp <= STOPS[0].t) return oklchStr(STOPS[0].color);
  const last = STOPS[STOPS.length - 1];
  if (temp >= last.t) return oklchStr(last.color);

  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (temp >= a.t && temp <= b.t) {
      const t = (temp - a.t) / (b.t - a.t);
      return oklchStr({
        l: lerp(a.color.l, b.color.l, t),
        c: lerp(a.color.c, b.color.c, t),
        h: lerp(a.color.h, b.color.h, t),
      });
    }
  }
  return oklchStr(last.color);
}

function oklchStr({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** Match commentary based on the hottest of the two scores. */
export function commentary(maxTemp: number | null | undefined): string {
  if (maxTemp == null) return "Kick-off pending…";
  if (maxTemp < 60) return "Warming up";
  if (maxTemp < 80) return "Second half, going strong";
  if (maxTemp <= 85) return "Squeaky bum time";
  return "EXTRA TIME — check your fans!";
}

/**
 * Duration (seconds) for one football traverse between the two scores.
 * Calm (~1.6s) when cool, frantic (~0.32s) when hot. Clamped either side.
 */
export function ballDuration(maxTemp: number | null | undefined): number {
  const t = maxTemp ?? 40;
  const clamped = Math.min(95, Math.max(35, t));
  const norm = (clamped - 35) / (95 - 35); // 0 (cool) → 1 (hot)
  return lerp(1.6, 0.32, norm);
}

/** Safe max of two possibly-null temperatures. */
export function maxTemp(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return Math.max(a ?? -Infinity, b ?? -Infinity);
}
