import Sparkline from "./Sparkline";
import type { Theme } from "../themes";

interface StatRowProps {
  label: string;
  value: number | null;
  unit: "°C" | "RPM";
  data: number[];
  color: string;
  theme: Theme;
}

/**
 * One "player stat": a label, a mini 60s sparkline, and the current value.
 * Used in the expanded view for per-core temps, GPU hotspot, NVMe and fans.
 */
export default function StatRow({
  label,
  value,
  unit,
  data,
  color,
  theme,
}: StatRowProps) {
  return (
    <div className="flex items-center gap-1.5 py-[3px]">
      <span
        className="w-[62px] shrink-0 truncate text-[10px] font-medium"
        style={{ color: theme.textMuted }}
        title={label}
      >
        {label}
      </span>
      <span className="shrink-0">
        <Sparkline data={data} color={color} width={64} height={15} />
      </span>
      <span
        className="flex-1 text-right text-[11px] font-semibold tabular-nums"
        style={{ color: unit === "°C" ? color : theme.text }}
      >
        {value != null ? Math.round(value) : "--"}
        <span className="ml-0.5 text-[8px] opacity-70">
          {unit === "°C" ? "°C" : "rpm"}
        </span>
      </span>
    </div>
  );
}
