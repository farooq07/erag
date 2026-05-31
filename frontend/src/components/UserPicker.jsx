import { useState, useRef, useEffect } from "react";
import { ChevronDown, Shield, Check, Lock } from "lucide-react";

const ROLE_GRADIENT = {
  Admin:              "from-rose-500 to-amber-400",
  CEO:                "from-amber-400 to-orange-500",
  "HR Manager":       "from-pink-500 to-fuchsia-400",
  "Finance Director": "from-emerald-500 to-teal-400",
  "IT Lead":          "from-sky-500 to-blue-400",
  "Legal Counsel":    "from-violet-500 to-purple-400",
  "Operations Lead":  "from-orange-500 to-amber-400",
};
const fallbackGradient = "from-indigo-500 to-indigo-300";

const initials = (name) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function UserPicker({ user, users, onChange }) {
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

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-2 py-1 rounded-lg border transition-all
          ${open ? "bg-white/[0.08] border-indigo-500/40"
                 : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]"}`}
      >
        <Avatar user={user} size={22} />
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[11px] text-white/85 font-medium">{user.name}</span>
          <span className="text-[9.5px] text-white/40 uppercase tracking-widest">{user.role}</span>
        </div>
        <ChevronDown
          size={11}
          className={`text-white/35 transition-transform ${open ? "rotate-180 text-indigo-400" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-80 bg-[#0d0d0d]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/70 overflow-hidden z-50"
          style={{ animation: "up-pop 160ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1.5">
            <Shield size={11} className="text-indigo-400" />
            <span className="text-[10px] text-white/50 uppercase tracking-widest">
              Switch user · demo
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {users.map((u) => {
              const active = u.id === user.id;
              return (
                <button
                  key={u.id}
                  onClick={() => { onChange(u); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                    ${active ? "bg-indigo-500/10" : "hover:bg-white/[0.04]"}`}
                >
                  <Avatar user={u} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-white/85 font-medium truncate">{u.name}</span>
                      {!u.can_upload && <Lock size={9} className="text-white/30" title="Read-only" />}
                    </div>
                    <div className="text-[10px] text-white/45">{u.role}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {u.departments.map((d) => (
                        <span key={d} className="text-[9px] px-1.5 py-0 rounded bg-white/[0.04] border border-white/[0.06] text-white/40">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                  {active && <Check size={12} className="text-indigo-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-white/[0.06] text-[9.5px] text-white/30 leading-relaxed">
            Identity comes from the <code className="text-white/45">X-User</code> header.
            Wire your SSO / SAML / OAuth here in production.
          </div>
        </div>
      )}

      <style>{`
        @keyframes up-pop {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}

function Avatar({ user, size = 24 }) {
  const grad = ROLE_GRADIENT[user.role] || fallbackGradient;
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-glow`}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {initials(user.name)}
    </div>
  );
}
