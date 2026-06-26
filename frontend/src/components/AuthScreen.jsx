import { useState } from "react";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

const API = "/api";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body = mode === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Something went wrong"); return; }
      localStorage.setItem("dm_token", data.token);
      onAuth(data.user, data.token);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  const switchMode = (m) => { setMode(m); setError(""); setForm({ name: "", email: "", password: "" }); };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 spotlight"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[380px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 mb-4">
            <Sparkles size={26} className="text-white" />
          </div>
          <h1 className="text-[22px] font-bold text-app tracking-tight">DocuMind</h1>
          <p className="text-[13px] text-faded mt-1">Your company knowledge, instantly</p>
        </div>

        {/* Card */}
        <div className="bg-panel border border-app rounded-2xl p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-panel-2 p-1 mb-5 gap-1">
            {[["login","Sign in"],["signup","Create account"]].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${
                  mode === m
                    ? "bg-indigo-600 text-white shadow"
                    : "text-faded hover:text-app"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  type="text" required autoComplete="name"
                  value={form.name} onChange={set("name")}
                  placeholder="Jane Smith"
                  className={INPUT}
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email" required autoComplete="email"
                value={form.email} onChange={set("email")}
                placeholder="you@acme.com"
                className={INPUT}
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={form.password} onChange={set("password")}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                  className={INPUT + " pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faded hover:text-app transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {mode === "login" && (
            <details className="mt-4 group">
              <summary className="text-[11px] text-faded cursor-pointer hover:text-app transition-colors list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Demo credentials
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-faded font-mono bg-panel-2 rounded-xl p-3 border border-app">
                {[
                  ["admin@acme.com","Admin123!"],
                  ["ceo@acme.com","Demo123!"],
                  ["hr@acme.com","Demo123!"],
                  ["finance@acme.com","Demo123!"],
                ].map(([email, pw]) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, email, password: pw }))}
                    className="text-left hover:text-indigo-400 transition-colors py-0.5"
                  >
                    {email} / {pw}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Toggle link */}
        <p className="text-center text-[12px] text-faded mt-5">
          {mode === "login" ? "New to DocuMind? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
          >
            {mode === "login" ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </div>
    </div>
  );
}

const INPUT = "w-full bg-panel-2 border border-app rounded-xl px-3 py-2.5 text-[13px] text-app placeholder:text-faded outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-faded mb-1.5">{label}</label>
      {children}
    </div>
  );
}
