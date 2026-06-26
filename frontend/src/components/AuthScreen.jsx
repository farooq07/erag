import { useState } from "react";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

const API = "/api";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
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
      if (!res.ok) {
        setError(data.detail || "Something went wrong");
        return;
      }
      localStorage.setItem("dm_token", data.token);
      onAuth(data.user, data.token);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-4">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-app">DocuMind</h1>
          <p className="text-[13px] text-faded mt-1">Your company knowledge, instantly</p>
        </div>

        {/* Card */}
        <div className="bg-panel border border-app rounded-2xl p-6 shadow-xl shadow-black/20">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-panel-2 p-1 mb-6 gap-1">
            {["login", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                  mode === m
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-faded hover:text-app"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] font-medium text-faded mb-1.5">Full name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Jane Smith"
                  className="w-full bg-panel-2 border border-app rounded-xl px-3 py-2.5 text-[13px] text-app placeholder:text-faded outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-faded mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="you@acme.com"
                className="w-full bg-panel-2 border border-app rounded-xl px-3 py-2.5 text-[13px] text-app placeholder:text-faded outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-faded mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={set("password")}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                  className="w-full bg-panel-2 border border-app rounded-xl px-3 py-2.5 pr-10 text-[13px] text-app placeholder:text-faded outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faded hover:text-app transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Demo credentials hint */}
          {mode === "login" && (
            <details className="mt-4">
              <summary className="text-[11px] text-faded cursor-pointer hover:text-app transition-colors">
                Demo credentials
              </summary>
              <div className="mt-2 space-y-1 text-[11px] text-faded font-mono bg-panel-2 rounded-lg p-2.5">
                <p>admin@acme.com / Admin123!</p>
                <p>ceo@acme.com / Demo123!</p>
                <p>hr@acme.com / Demo123!</p>
                <p>finance@acme.com / Demo123!</p>
              </div>
            </details>
          )}
        </div>

        <p className="text-center text-[11px] text-faded mt-4">
          {mode === "login" ? "New to DocuMind? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
