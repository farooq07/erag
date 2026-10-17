import { ChevronDown, Shield, Check, Lock } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLE_GRADIENT = {
  Admin:              "from-rose-500 to-amber-400",
  CEO:                "from-amber-400 to-orange-500",
  "HR Manager":       "from-pink-500 to-fuchsia-400",
  "Finance Director": "from-emerald-500 to-teal-400",
  "IT Lead":          "from-sky-500 to-blue-400",
  "Legal Counsel":    "from-violet-500 to-purple-400",
  "Operations Lead":  "from-orange-500 to-amber-400",
};
const fallbackGradient = "from-zinc-500 to-zinc-300";

const initials = (name) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function UserPicker({ user, users, onChange }) {
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 transition-colors hover:bg-accent">
          <Avatar user={user} size={22} />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-medium text-foreground">{user.name}</span>
            <span className="text-[9.5px] uppercase tracking-widest text-muted-foreground">{user.role}</span>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Shield className="h-3 w-3" /> Switch user · demo
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[60vh] overflow-y-auto">
          {users.map((u) => {
            const active = u.id === user.id;
            return (
              <DropdownMenuItem
                key={u.id}
                onClick={() => onChange(u)}
                className="gap-3 py-2.5"
              >
                <Avatar user={u} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-foreground">{u.name}</span>
                    {!u.can_upload && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{u.role}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.departments.map((d) => (
                      <Badge key={d} variant="secondary" className="px-1.5 py-0 text-[9px] font-normal">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
                {active && <Check className="h-3 w-3 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
          Identity comes from the <code className="text-foreground">X-User</code> header.
          Wire your SSO / SAML / OAuth here in production.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ user, size = 24 }) {
  const grad = ROLE_GRADIENT[user.role] || fallbackGradient;
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white", grad)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {initials(user.name)}
    </div>
  );
}
