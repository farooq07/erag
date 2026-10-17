import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const KEY = "dm.theme"; // "light" | "dark" | "system" — dark-first to match the brand

const systemPrefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

const applyTheme = (theme) => {
  const effective = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  const html = document.documentElement;
  html.classList.toggle("dark", effective === "dark");
  html.classList.toggle("light", effective === "light");
};

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme]);

  return [theme, setTheme];
}

const OPTIONS = [
  { id: "light",  label: "Light",  Icon: Sun },
  { id: "dark",   label: "Dark",   Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const current = OPTIONS.find((o) => o.id === theme) || OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" title={`Theme: ${current.label}`}>
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map(({ id, label, Icon }) => (
          <DropdownMenuItem key={id} onClick={() => setTheme(id)} className="gap-2 text-xs">
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1">{label}</span>
            {id === theme && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
