import StatRow from "./StatRow";
import type { SensorSnapshot } from "../types";
import type { Theme } from "../themes";
import { tempColor } from "../lib/temp";

interface ExpandedStatsProps {
  snapshot: SensorSnapshot | null;
  history: Record<string, number[]>;
  theme: Theme;
}

/**
 * The expanded "player stats" panel: per-core CPU temps, GPU core + hotspot,
 * NVMe temperature and fan RPMs, each with a 60-sample sparkline. The row list
 * scrolls if it overflows the card.
 */
export default function ExpandedStats({
  snapshot,
  history,
  theme,
}: ExpandedStatsProps) {
  const h = (key: string): number[] => history[key] ?? [];

  return (
    <div className="flex h-full flex-col px-3 pb-2 pt-2">
      <div
        className="mb-1 flex items-center justify-between border-b pb-1"
        style={{ borderColor: theme.border }}
      >
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.25em]"
          style={{ color: theme.accent }}
        >
          Player Stats
        </span>
        <span className="text-[9px]" style={{ color: theme.textMuted }}>
          last 60s
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-0.5">
        <SectionLabel theme={theme}>RYZEN · cores</SectionLabel>
        {snapshot?.coreTemps.length ? (
          snapshot.coreTemps.map((c) => (
            <StatRow
              key={c.key}
              label={c.label}
              value={c.value}
              unit="°C"
              data={h(c.key)}
              color={tempColor(c.value)}
              theme={theme}
            />
          ))
        ) : (
          <StatRow
            label="CPU package"
            value={snapshot?.cpuTemp ?? null}
            unit="°C"
            data={h("cpu")}
            color={tempColor(snapshot?.cpuTemp)}
            theme={theme}
          />
        )}

        <SectionLabel theme={theme}>RTX · graphics</SectionLabel>
        <StatRow
          label="GPU Core"
          value={snapshot?.gpuTemp ?? null}
          unit="°C"
          data={h("gpu")}
          color={tempColor(snapshot?.gpuTemp)}
          theme={theme}
        />
        {snapshot?.gpuHotspot != null && (
          <StatRow
            label="GPU Hot Spot"
            value={snapshot.gpuHotspot}
            unit="°C"
            data={h("hotspot")}
            color={tempColor(snapshot.gpuHotspot)}
            theme={theme}
          />
        )}

        <SectionLabel theme={theme}>Storage</SectionLabel>
        <StatRow
          label="NVMe"
          value={snapshot?.nvmeTemp ?? null}
          unit="°C"
          data={h("nvme")}
          color={tempColor(snapshot?.nvmeTemp)}
          theme={theme}
        />

        {snapshot && snapshot.fans.length > 0 && (
          <>
            <SectionLabel theme={theme}>Fans</SectionLabel>
            {snapshot.fans.map((f) => (
              <StatRow
                key={f.key}
                label={f.label}
                value={f.value}
                unit="RPM"
                data={h(f.key)}
                color={theme.accent}
                theme={theme}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) {
  return (
    <div
      className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] opacity-70"
      style={{ color: theme.accent }}
    >
      {children}
    </div>
  );
}
