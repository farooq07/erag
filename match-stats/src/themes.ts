/**
 * Visual themes for the scoreboard. The default is the pitch-green kit; the
 * rest are club presets selectable from the right-click menu (wired in M4).
 *
 * Colors are OKLCH strings so gradients stay perceptually smooth. Temperature
 * status colors (green/amber/red) live in `lib/temp.ts` and are intentionally
 * kept constant across themes for at-a-glance readability.
 */
export interface Theme {
  id: string;
  /** Display name shown in the theme menu. */
  name: string;
  /** Card background gradient stops (OKLCH). */
  gradientFrom: string;
  gradientTo: string;
  /** Accent used for team labels, header and the ball's glow. */
  accent: string;
  /** Secondary accent (e.g. the "away" side / trim). */
  accentAlt: string;
  /** Primary text color on the card. */
  text: string;
  /** Muted text (labels, commentary). */
  textMuted: string;
  /** Hairline border color. */
  border: string;
}

export const THEMES: Record<string, Theme> = {
  pitch: {
    id: "pitch",
    name: "Pitch Green",
    gradientFrom: "oklch(0.25 0.05 155)",
    gradientTo: "oklch(0.16 0.04 155)",
    accent: "oklch(0.75 0.18 145)",
    accentAlt: "oklch(0.75 0.18 145)",
    text: "oklch(0.98 0 0)",
    textMuted: "oklch(0.75 0.02 155)",
    border: "oklch(0.75 0.18 145 / 0.25)",
  },
  madrid: {
    id: "madrid",
    name: "Real Madrid",
    gradientFrom: "oklch(0.96 0.01 250)",
    gradientTo: "oklch(0.86 0.02 250)",
    accent: "oklch(0.78 0.15 85)", // gold
    accentAlt: "oklch(0.55 0.16 265)", // royal blue trim
    text: "oklch(0.22 0.02 260)",
    textMuted: "oklch(0.45 0.03 260)",
    border: "oklch(0.78 0.15 85 / 0.5)",
  },
  barca: {
    id: "barca",
    name: "Barcelona",
    gradientFrom: "oklch(0.32 0.14 265)", // blaugrana blue
    gradientTo: "oklch(0.30 0.15 20)", // garnet
    accent: "oklch(0.80 0.16 85)", // gold trim
    accentAlt: "oklch(0.70 0.18 20)",
    text: "oklch(0.98 0 0)",
    textMuted: "oklch(0.85 0.03 60)",
    border: "oklch(0.80 0.16 85 / 0.35)",
  },
  united: {
    id: "united",
    name: "Man United",
    gradientFrom: "oklch(0.30 0.16 25)", // red
    gradientTo: "oklch(0.15 0.02 25)", // black
    accent: "oklch(0.82 0.16 85)", // yellow/gold
    accentAlt: "oklch(0.70 0.20 25)",
    text: "oklch(0.98 0 0)",
    textMuted: "oklch(0.80 0.04 40)",
    border: "oklch(0.82 0.16 85 / 0.35)",
  },
};

export const DEFAULT_THEME_ID = "pitch";

export type ThemeId = keyof typeof THEMES;

export function getTheme(id: string | null | undefined): Theme {
  return (id && THEMES[id]) || THEMES[DEFAULT_THEME_ID];
}
