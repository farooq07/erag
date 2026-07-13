import type { SensorSnapshot } from "../types";
import type { Theme } from "../themes";
import { tempColor } from "../lib/temp";

interface UltraCompactProps {
  snapshot: SensorSnapshot | null;
  theme: Theme;
}

/** Ultra-compact face (120×50): just the two temperatures either side of a ball. */
export default function UltraCompact({ snapshot, theme }: UltraCompactProps) {
  const cpu = snapshot?.cpuTemp ?? null;
  const gpu = snapshot?.gpuTemp ?? null;
  return (
    <div className="flex h-full w-full items-center justify-center gap-1.5 px-2">
      <span
        className="text-xl font-bold tabular-nums leading-none"
        style={{ color: tempColor(cpu) }}
      >
        {cpu != null ? Math.round(cpu) : "--"}°
      </span>
      <span className="text-[11px]" style={{ color: theme.textMuted }}>
        ⚽
      </span>
      <span
        className="text-xl font-bold tabular-nums leading-none"
        style={{ color: tempColor(gpu) }}
      >
        {gpu != null ? Math.round(gpu) : "--"}°
      </span>
    </div>
  );
}
