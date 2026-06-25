import { useState } from "react";
import { Sparkles, Building2, Shield, ChevronRight } from "lucide-react";

const DEPT_COLORS = {
  HR: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  Finance: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  Accounts: "bg-teal-500/15 text-teal-300 border-teal-500/25",
  IT: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  Legal: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  Operations: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  General: "bg-slate-500/15 text-slate-300 border-slate-500/25",
};

const ROLE_ICONS = {
  Admin: "⚙️", CEO: "👔", "HR Manager": "👥",
  "Finance Director": "📊", "IT Lead": "💻",
  "Legal Counsel": "⚖️", "Operations Lead": "🏭",
};

function UserCard({ user, selected, onClick }) {
  const depts = user.departments || [];
  return (
    <button
      onClick={onClick}
      className={`group relative w-full text-left rounded-2xl border p-4 transition-all duration-200 ${
        selected
          ? "bg-indigo-600/20 border-indigo-500/60 shadow-glow ring-1 ring-indigo-500/40"
          : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] hover:border-indigo-500/30"
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none mt-0.5">{ROLE_ICONS[user.role] || "👤"}</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white/90 truncate">{user.name}</p>
          <p className="text-[11px] text-faded mt-0.5">{user.role}</p>
        </div>
        {selected && (
          <span className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
            <ChevronRight size={10} className="text-white" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {depts.map((d) => (
          <span key={d} className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${DEPT_COLORS[d] || DEPT_COLORS.General}`}>
            {d}
          </span>
        ))}
        {user.can_upload && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/25">
            can upload
          </span>
        )}
      </div>
    </button>
  );
}

export default function LoginScreen({ users = [], onLogin }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="fixed inset-0 bg-base flex items-center justify-center p-4 z-50">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)" }}
      />
      <div className="relative w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-panel-2 border border-app-2 mb-5 relative overflow-hidden shadow-glow">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-transparent to-ember-500/25" />
            <Sparkles size={24} className="relative text-indigo-300" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white/95 mb-1.5">DocuMind</h1>
          <p className="text-[13px] text-muted-app">Select your role to access your department's documents</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {users.map((u) => (
            <UserCard key={u.id} user={u} selected={selected?.id === u.id} onClick={() => setSelected(u)} />
          ))}
        </div>
        <button
          onClick={() => selected && onLogin(selected)}
          disabled={!selected}
          className={`w-full py-3.5 rounded-2xl font-semibold text-[14px] transition-all duration-200 ${
            selected
              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow"
              : "bg-white/[0.05] text-white/30 cursor-not-allowed border border-white/[0.06]"
          }`}
        >
          {selected ? `Continue as ${selected.name}` : "Select a role to continue"}
        </button>
        <div className="mt-5 flex items-center justify-center gap-4 text-[10px] text-faded">
          <span className="flex items-center gap-1.5"><Shield size={9} className="text-emerald-400/60" /> Local embeddings</span>
          <span className="text-vanish">·</span>
          <span className="flex items-center gap-1.5"><Building2 size={9} className="text-indigo-400/60" /> Department-scoped</span>
          <span className="text-vanish">·</span>
          <span>Acme Corp</span>
        </div>
      </div>
    </div>
  );
}
