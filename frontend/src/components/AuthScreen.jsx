import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setAccessToken } from "@/lib/session";

const API = "/api";

// Demo logins reveal real passwords, so keep them out of production builds.
const SHOW_DEMO_LOGINS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === "true";

// A password-reset email links to /reset-password?token=…
function resetTokenFromUrl() {
  if (window.location.pathname !== "/reset-password") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

// A failed SSO callback redirects to /?sso_error=…; read it once, then tidy the URL.
function ssoErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const msg = params.get("sso_error") || "";
  if (msg) window.history.replaceState(null, "", window.location.pathname);
  return msg;
}

export default function AuthScreen({ onAuth }) {
  const [resetToken] = useState(resetTokenFromUrl);
  const [mode, setMode] = useState(resetToken ? "reset" : "login"); // login | signup | forgot | reset
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(ssoErrorFromUrl);
  const [notice, setNotice] = useState("");
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    fetch(`${API}/auth/sso/providers`)
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
  }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong");
    return data;
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "login" || mode === "signup") {
        const data = mode === "login"
          ? await post("/auth/login", { email: form.email, password: form.password })
          : await post("/auth/signup", { name: form.name, email: form.email, password: form.password });
        setAccessToken(data.access_token);
        onAuth(data.user);
      } else if (mode === "forgot") {
        const data = await post("/auth/forgot-password", { email: form.email });
        setNotice(data.message);
      } else if (mode === "reset") {
        await post("/auth/reset-password", { token: resetToken, password: form.password });
        window.history.replaceState(null, "", "/");
        switchMode("login");
        setNotice("Password updated. Sign in with your new password.");
      }
    } catch (err) {
      setError(err instanceof TypeError ? "Network error — is the server running?" : err.message);
    } finally {
      setLoading(false);
    }
  }

  const switchMode = (m) => { setMode(m); setError(""); setNotice(""); setForm({ name: "", email: "", password: "" }); };

  const title = { forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const submitLabel = { login: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Set new password" }[mode];
  const needsPassword = mode !== "forgot";
  const needsEmail = mode !== "reset";

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
          {title ? (
            <h2 className="mb-5 text-[14px] font-semibold text-foreground">{title}</h2>
          ) : (
            /* Tab switcher */
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
          )}

          {(mode === "login" || mode === "signup") && providers.length > 0 && (
            <div className="mb-5 space-y-2">
              {providers.map((p) => (
                <Button
                  key={p.id}
                  asChild
                  variant="outline"
                  className="w-full gap-2"
                >
                  <a href={`${API}/auth/sso/${p.id}/start`}>
                    <ProviderIcon id={p.id} />
                    Continue with {p.label}
                  </a>
                </Button>
              ))}
              <div className="flex items-center gap-3 pt-2 text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <Field label="Full name">
                <Input type="text" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Jane Smith" />
              </Field>
            )}

            {needsEmail && (
              <Field label="Email">
                <Input type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@acme.com" />
              </Field>
            )}

            {needsPassword && (
              <Field label={mode === "reset" ? "New password" : "Password"}>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"} required
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={mode === "login" ? undefined : 8}
                    value={form.password} onChange={set("password")}
                    placeholder={mode === "login" ? "••••••••" : "Min. 8 characters"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
            )}

            {mode === "login" && (
              <div className="-mt-2 text-right">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl border bg-muted px-3 py-2 text-[12px] text-foreground">
                {notice}
              </p>
            )}

            <Button type="submit" disabled={loading} className="mt-1 w-full gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
            </Button>
          </form>

          {mode === "login" && SHOW_DEMO_LOGINS && (
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
          {mode === "login" && "New to DocuMind? "}
          {mode === "signup" && "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              if (mode === "reset") window.history.replaceState(null, "", "/");
              switchMode(mode === "login" ? "signup" : "login");
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Create an account" : mode === "signup" ? "Sign in instead" : "Back to sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

// Official brand marks (Google "G", Microsoft four squares), as their sign-in
// guidelines require for these buttons.
function ProviderIcon({ id }) {
  if (id === "google") {
    return (
      <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    );
  }
  if (id === "microsoft") {
    return (
      <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
    );
  }
  return null;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
