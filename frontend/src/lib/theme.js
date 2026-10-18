import { useEffect, useState } from "react";

const KEY = "dm.theme"; // "light" | "dark" | "system" — dark-first to match the brand

export const systemPrefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

export const applyTheme = (theme) => {
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
