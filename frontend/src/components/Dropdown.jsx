import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * Dark themed dropdown.
 *
 * options: array of either:
 *   - string                          → label === value
 *   - { value, label?, dotClass? }    → optional left color dot
 */
export default function Dropdown({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  icon = null,
  size = "sm",          // "sm" | "md"
  align = "left",       // "left" | "right"
  className = "",
  menuClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const wrapRef = useRef(null);

  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : { label: o.value, ...o }
  );
  const current = normalized.find((o) => o.value === value);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = useCallback((v) => { onChange?.(v); setOpen(false); }, [onChange]);

  const onTriggerKey = (e) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHoverIdx(Math.max(0, normalized.findIndex((o) => o.value === value)));
    }
  };

  const onMenuKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => (i + 1) % normalized.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => (i - 1 + normalized.length) % normalized.length);
    } else if (e.key === "Enter" && hoverIdx >= 0) {
      e.preventDefault();
      select(normalized[hoverIdx].value);
    }
  };

  const sizing = size === "md"
    ? "px-3 py-2 text-xs"
    : "px-2.5 py-1.5 text-[11px]";

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={`group flex items-center gap-1.5 w-full bg-white/[0.04] hover:bg-white/[0.07]
          border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-white/80
          transition-all duration-150 focus:outline-none focus:border-indigo-500/50
          focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed
          ${sizing}
          ${open ? "border-indigo-500/40 bg-white/[0.06]" : ""}`}
      >
        {icon && <span className="text-white/40 flex-shrink-0">{icon}</span>}
        {current?.dotClass && (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dotClass}`} />
        )}
        <span className="truncate flex-1 text-left">{current?.label ?? placeholder}</span>
        <ChevronDown
          size={12}
          className={`text-white/35 flex-shrink-0 transition-transform duration-200
            ${open ? "rotate-180 text-indigo-400" : "group-hover:text-white/60"}`}
        />
      </button>

      {open && (
        <div
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className={`absolute z-50 mt-1.5 min-w-full w-max max-w-[260px]
            bg-[#0d0d0d]/95 backdrop-blur-xl border border-white/[0.08]
            rounded-xl shadow-2xl shadow-black/60 overflow-hidden
            ring-1 ring-white/[0.02]
            ${align === "right" ? "right-0" : "left-0"}
            ${menuClassName}`}
          style={{ animation: "dd-pop 140ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <div className="py-1 max-h-72 overflow-y-auto custom-scroll">
            {normalized.map((o, i) => {
              const active = o.value === value;
              const hovered = i === hoverIdx;
              return (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => select(o.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11.5px] text-left transition-colors
                    ${hovered ? "bg-indigo-500/15 text-white" : "text-white/70 hover:text-white"}
                    ${active ? "text-indigo-300" : ""}`}
                >
                  {o.dotClass && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${o.dotClass}`} />
                  )}
                  <span className="truncate flex-1">{o.label}</span>
                  {active && <Check size={11} className="text-indigo-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes dd-pop {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}

// Tailwind dot classes per department — exported so callers can build options.
export const DEPT_DOT = {
  HR:          "bg-pink-400",
  Accounts:    "bg-emerald-400",
  Finance:     "bg-amber-400",
  IT:          "bg-sky-400",
  Legal:       "bg-violet-400",
  Operations:  "bg-orange-400",
  General:     "bg-white/50",
  All:         "bg-indigo-400",
};
