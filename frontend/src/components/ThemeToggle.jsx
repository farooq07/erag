import { useEffect, useState, useRef } from "react";
import { Sun, Moon, Monitor, ChevronDown, Check } from "lucide-react";

const KEY = "erag.theme"; // "light" | "dark" | "system"

const systemPrefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

const applyTheme = (theme) => {
  const effective = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  const html = document.documentElement;
  html.classList.toggle("dark", effective === "dark");
  html.classList.toggle("light", effective === "light");
};

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Re-apply on OS theme change while "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme]);

  return [theme, setTheme];
}

const OPTIONS = [
  { id: "light",  label: "Light",  Icon: Sun },
  { id: "dark",   label: "Dark",   Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.id === theme) || OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Theme: ${current.label}`}
        className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border transition-all
          ${open ? "bg-surface-2 border-strong" : "bg-surface border-app-2 hover:bg-surface-2 hover:border-strong"}`}
      >
        <CurrentIcon size={13} className="text-muted-app" />
        <ChevronDown size={10} className={`text-faded transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-36 bg-panel-2 border border-app-2 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ animation: "msg-in 160ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {OPTIONS.map(({ id, label, Icon }) => {
            const active = id === theme;
            return (
              <button
                key={id}
                onClick={() => { setTheme(id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11.5px] transition-colors
                  ${active ? "text-app bg-surface" : "text-muted-app hover:text-app hover:bg-surface"}`}
              >
                <Icon size={12} />
                <span className="flex-1">{label}</span>
                {active && <Check size={11} className="text-indigo-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
