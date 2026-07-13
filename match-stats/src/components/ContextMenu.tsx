import { useEffect } from "react";
import { THEMES, type Theme } from "../themes";

interface ContextMenuProps {
  x: number;
  y: number;
  activeThemeId: string;
  theme: Theme;
  onSelectTheme: (id: string) => void;
  onClose: () => void;
}

/**
 * Right-click menu for picking a club theme. Rendered as a plain DOM overlay
 * (the window is frameless, so there is no native menu). Marked `data-no-drag`
 * so interacting with it never starts a window drag.
 */
export default function ContextMenu({
  x,
  y,
  activeThemeId,
  theme,
  onSelectTheme,
  onClose,
}: ContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

  // Keep the menu on-screen (widget is small; menu opens up/left when near edges).
  const style: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 8),
    left: Math.min(x, window.innerWidth - 140),
    background: `linear-gradient(160deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
    borderColor: theme.border,
    color: theme.text,
  };

  return (
    <div
      data-no-drag
      className="fixed z-50 min-w-[132px] overflow-hidden rounded-xl border py-1 shadow-2xl backdrop-blur-md"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="px-3 pb-1 pt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] opacity-60"
        style={{ color: theme.accent }}
      >
        Choose kit
      </div>
      {Object.values(THEMES).map((t) => {
        const active = t.id === activeThemeId;
        return (
          <button
            key={t.id}
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] hover:bg-white/10"
            onClick={() => {
              onSelectTheme(t.id);
              onClose();
            }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
              style={{
                background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.accent})`,
              }}
            />
            <span className="flex-1">{t.name}</span>
            {active && (
              <span style={{ color: theme.accent }} className="text-[10px]">
                ●
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
