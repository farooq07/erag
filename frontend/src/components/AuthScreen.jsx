import { useState } from "react";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-[380px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles size={26} />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">DocuMind</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Your company knowledge, instantly</p>
        </div>

        <Card className="p-6">
          {/* Tab switcher */}
          <div className="mb-5 flex gap-1 rounded-xl bg-muted p-1">
            {[["login", "Sign in"], ["signup", "Create account"]].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <Field label="Full name">
                <Input type="text" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Jane Smith" />
              </Field>
            )}

            <Field label="Email">
              <Input type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@acme.com" />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"} required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={form.password} onChange={set("password")}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="mt-1 w-full gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {mode === "login" && (
            <details className="group mt-4">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                Demo credentials
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-1 rounded-xl border bg-muted p-3 font-mono text-[11px] text-muted-foreground">
                {[
                  ["admin@acme.com", "Admin123!"],
                  ["ceo@acme.com", "Demo123!"],
                  ["hr@acme.com", "Demo123!"],
                  ["finance@acme.com", "Demo123!"],
                ].map(([email, pw]) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, email, password: pw }))}
                    className="py-0.5 text-left transition-colors hover:text-foreground"
                  >
                    {email} / {pw}
                  </button>
                ))}
              </div>
            </details>
          )}
        </Card>

        <p className="mt-5 text-center text-[12px] text-muted-foreground">
          {mode === "login" ? "New to DocuMind? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
