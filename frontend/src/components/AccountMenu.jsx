import { useState } from "react";
import { KeyRound, Loader2, LogOut, MonitorX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, setAccessToken } from "@/lib/session";

const API = "/api";

export default function AccountMenu({ currentUser, onLogout }) {
  const [pwOpen, setPwOpen] = useState(false);

  const logoutEverywhere = async () => {
    await apiFetch(`${API}/auth/logout-all`, { method: "POST" }).catch(() => {});
    onLogout();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 transition-colors hover:bg-accent"
            aria-label="Account menu"
          >
            <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {currentUser.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="max-w-[80px] truncate text-[11px] font-medium text-foreground">{currentUser.name}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">· {currentUser.role}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{currentUser.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPwOpen(true)} className="gap-2 text-[12px]">
            <KeyRound className="h-3.5 w-3.5" /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={logoutEverywhere} className="gap-2 text-[12px]">
            <MonitorX className="h-3.5 w-3.5" /> Sign out of all devices
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout} className="gap-2 text-[12px] text-destructive focus:text-destructive">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}

function ChangePasswordDialog({ open, onOpenChange }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = (v) => {
    onOpenChange(v);
    if (!v) { setCurrent(""); setNext(""); setError(""); setDone(false); }
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(typeof d.detail === "string" ? d.detail : "Could not change password"); return; }
      setAccessToken(d.access_token); // other sessions were revoked; this one continues
      setDone(true);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Change password</DialogTitle>
          <DialogDescription className="text-[12px]">
            You'll stay signed in here; every other device is signed out.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <p role="status" className="text-[12.5px] text-foreground">Password updated.</p>
            <DialogFooter><Button onClick={() => close(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" required autoComplete="current-password" placeholder="Current password"
                   value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input type="password" required minLength={8} autoComplete="new-password" placeholder="New password (min. 8 characters)"
                   value={next} onChange={(e) => setNext(e.target.value)} />
            {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />}
                Update password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
