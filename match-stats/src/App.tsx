import { useEffect, useRef, useState } from "react";
import { useSensors } from "./hooks/useSensors";
import { useThemeConfig } from "./hooks/useConfig";
import Scoreboard from "./components/Scoreboard";
import ExpandedStats from "./components/ExpandedStats";
import UltraCompact from "./components/UltraCompact";
import ContextMenu from "./components/ContextMenu";
import { getTheme } from "./themes";
import {
  applyWindowSize,
  beginDrag,
  isTauri,
  MODE_SIZE,
  type WidgetMode,
} from "./lib/window";

/**
 * Match Stats — always-on-top CPU/GPU temperature widget.
 *
 * Milestone 4 adds the three display modes (normal / expanded / ultra-compact),
 * runtime theme switching via a right-click menu, and config persistence.
 * Single click toggles the expanded stats; double click toggles ultra-compact.
 */
export default function App() {
  const { snapshot, history, status } = useSensors();
  const { themeId, setThemeId } = useThemeConfig();
  const theme = getTheme(themeId);

  const [mode, setMode] = useState<WidgetMode>("normal");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resize the OS window whenever the mode changes.
  useEffect(() => {
    void applyWindowSize(mode);
  }, [mode]);

  // Push the GPU temperature to the tray badge on every update.
  const gpuTemp = snapshot?.gpuTemp ?? null;
  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("set_tray_temp", {
        temp: gpuTemp != null ? Math.round(gpuTemp) : null,
      }),
    );
  }, [gpuTemp]);

  // Apply theme changes triggered from the tray's Theme submenu.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      unlisten = await listen<string>("set-theme", (e) => setThemeId(e.payload));
    });
    return () => unlisten?.();
  }, [setThemeId]);

  const handleClick = (): void => {
    // Debounce so a double-click doesn't also fire the single-click action.
    if (clickTimer.current) return;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setMode((m) => (m === "expanded" ? "normal" : "expanded"));
    }, 220);
  };

  const handleDoubleClick = (): void => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setMode((m) => (m === "ultra" ? "normal" : "ultra"));
  };

  const { w, h } = MODE_SIZE[mode];

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
      style={{
        width: w,
        height: h,
        background: `linear-gradient(145deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        borderColor: theme.border,
      }}
      onMouseDown={beginDrag}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {mode === "expanded" ? (
        <ExpandedStats snapshot={snapshot} history={history} theme={theme} />
      ) : mode === "ultra" ? (
        <UltraCompact snapshot={snapshot} theme={theme} />
      ) : (
        <Scoreboard snapshot={snapshot} status={status} theme={theme} />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          activeThemeId={themeId}
          theme={theme}
          onSelectTheme={setThemeId}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
