import { motion } from "framer-motion";
import type { SensorSnapshot, SensorStatus } from "../types";
import type { Theme } from "../themes";
import { ballDuration, commentary, maxTemp, tempColor } from "../lib/temp";

interface ScoreboardProps {
  snapshot: SensorSnapshot | null;
  status: SensorStatus;
  theme: Theme;
}

const LHM_HINT =
  "Can't reach LibreHardwareMonitor. Start it (Run as administrator), then " +
  "enable Options → Remote Web Server (port 8085). Retrying every 5s…";

/** One side of the scoreline: team label + big temperature "score". */
function Score({
  label,
  temp,
  theme,
  align,
}: {
  label: string;
  temp: number | null;
  theme: Theme;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col ${
        align === "right" ? "items-end" : "items-start"
      }`}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: theme.textMuted }}
      >
        {label}
      </span>
      <span
        className="font-display text-[34px] font-bold leading-none tabular-nums"
        style={{ color: tempColor(temp), textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}
      >
        {temp != null ? Math.round(temp) : "--"}
        <span className="align-top text-base">°</span>
      </span>
    </div>
  );
}

/** The bouncing football; speed scales with the hotter score. */
function Football({ maxT, theme }: { maxT: number | null; theme: Theme }) {
  const dur = ballDuration(maxT);
  return (
    <div className="relative flex h-full w-9 items-center justify-center">
      <motion.div
        aria-hidden
        className="text-lg"
        style={{ filter: `drop-shadow(0 0 5px ${theme.accent})` }}
        animate={{ x: [-14, 14], y: [0, -10, 0], rotate: [0, 360] }}
        transition={{
          x: { duration: dur, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
          y: { duration: dur, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: dur * 2.2, repeat: Infinity, ease: "linear" },
        }}
      >
        ⚽
      </motion.div>
    </div>
  );
}

/**
 * The compact "football scoreline": RYZEN vs RTX with a bouncing ball and a
 * live commentary line. This is the default (normal) widget face; the
 * expanded/ultra-compact modes reuse the same data in M4.
 */
export default function Scoreboard({ snapshot, status, theme }: ScoreboardProps) {
  const cpu = snapshot?.cpuTemp ?? null;
  const gpu = snapshot?.gpuTemp ?? null;
  const hottest = maxTemp(cpu, gpu);
  const pending = status === "pending";

  return (
    <div className="flex h-full w-full flex-col justify-between px-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.25em]"
          style={{ color: theme.accent }}
        >
          Match Stats
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          title={pending ? LHM_HINT : "Live"}
          style={{
            backgroundColor: pending ? "oklch(0.8 0.17 70)" : "oklch(0.78 0.19 145)",
            boxShadow: `0 0 5px ${pending ? "oklch(0.8 0.17 70)" : "oklch(0.78 0.19 145)"}`,
          }}
        />
      </div>

      {pending ? (
        <div
          className="flex flex-1 cursor-help flex-col items-center justify-center text-center"
          title={LHM_HINT}
        >
          <span className="text-lg">⚽</span>
          <span
            className="mt-1 text-sm font-semibold"
            style={{ color: theme.text }}
          >
            Kick-off pending…
          </span>
          <span className="text-[10px]" style={{ color: theme.textMuted }}>
            start LibreHardwareMonitor
          </span>
        </div>
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex flex-1 items-center justify-between">
            <Score label="RYZEN" temp={cpu} theme={theme} align="left" />
            <Football maxT={hottest} theme={theme} />
            <Score label="RTX" temp={gpu} theme={theme} align="right" />
          </div>

          {/* Commentary */}
          <div
            className="truncate text-center text-[11px] font-medium italic"
            style={{ color: theme.textMuted }}
          >
            {commentary(hottest)}
          </div>
        </>
      )}
    </div>
  );
}
