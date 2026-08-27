import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

const ToastCtx = createContext(() => {});

export const useToast = () => useContext(ToastCtx);

const VARIANTS = {
  success: { Icon: CheckCircle2,   ring: "border-emerald-500/30", tint: "bg-emerald-500/10", fg: "text-emerald-400" },
  error:   { Icon: XCircle,        ring: "border-red-500/30",     tint: "bg-red-500/10",     fg: "text-red-400" },
  warning: { Icon: AlertTriangle,  ring: "border-amber-500/30",   tint: "bg-amber-500/10",   fg: "text-amber-400" },
  info:    { Icon: Info,           ring: "border-indigo-500/30",  tint: "bg-indigo-500/10",  fg: "text-indigo-400" },
};

let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    // Mark as leaving so the exit animation can play, then unmount.
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 220);
  }, []);

  const toast = useCallback((message, variant = "info", duration = 4000) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, variant, leaving: false }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const v = VARIANTS[t.variant] ?? VARIANTS.info;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 min-w-[260px] max-w-[380px]
                bg-panel-2/95 backdrop-blur-md border ${v.ring} rounded-xl px-3.5 py-2.5
                shadow-xl shadow-black/40 ${t.leaving ? "toast-out" : "toast-in"}`}
            >
              <span className={`mt-px flex-shrink-0 ${v.fg}`}><v.Icon size={14} /></span>
              <p className="flex-1 text-[12px] text-app leading-relaxed">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-ghost hover:text-app transition-colors -mr-1 -mt-0.5 p-0.5 rounded"
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
