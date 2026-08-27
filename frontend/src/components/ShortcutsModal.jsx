import { useEffect } from "react";
import { X, Command } from "lucide-react";

const SHORTCUTS = [
  { keys: ["⌘", "K"],     label: "Focus the question box" },
  { keys: ["⌘", "↵"],     label: "Send question" },
  { keys: ["⇧", "↵"],     label: "New line in question" },
  { keys: ["⌘", "⇧", "O"], label: "Start a new chat" },
  { keys: ["⌘", "⇧", "E"], label: "Export conversation" },
  { keys: ["⌘", "/"],      label: "Show this help" },
  { keys: ["Esc"],         label: "Close panel or dialog" },
];

export default function ShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-panel border border-app-2 rounded-2xl shadow-2xl shadow-black/50 scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app">
          <div className="flex items-center gap-2">
            <Command size={13} className="text-indigo-400" />
            <h2 className="text-[13px] font-semibold text-app">Keyboard shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-ghost hover:text-app p-1 rounded-lg hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-3">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between py-2 border-b border-app last:border-0">
              <span className="text-[12px] text-muted-app">{s.label}</span>
              <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center
                      rounded-md bg-surface-2 border border-app-2 text-[10px] text-app font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="px-5 pb-4 pt-1 text-[10.5px] text-vanish">
          On Windows and Linux, use <span className="font-mono">Ctrl</span> in place of <span className="font-mono">⌘</span>.
        </p>
      </div>
    </div>
  );
}
