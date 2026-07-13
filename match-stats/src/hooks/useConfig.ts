import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME_ID } from "../themes";

const STORE_FILE = "settings.json";
const THEME_KEY = "themeId";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Persisted widget config. Currently the selected theme. In the packaged app it
 * is saved to the Tauri store (app config dir); in the browser preview it falls
 * back to localStorage so theme choice still survives a reload.
 */
export function useThemeConfig(): {
  themeId: string;
  setThemeId: (id: string) => void;
  loaded: boolean;
} {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isTauri()) {
          const { load } = await import("@tauri-apps/plugin-store");
          const store = await load(STORE_FILE, { autoSave: true, defaults: {} });
          const saved = await store.get<string>(THEME_KEY);
          if (!cancelled && saved) setThemeIdState(saved);
        } else {
          const saved = window.localStorage.getItem(THEME_KEY);
          if (!cancelled && saved) setThemeIdState(saved);
        }
      } catch {
        /* fall back to default theme */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    (async () => {
      try {
        if (isTauri()) {
          const { load } = await import("@tauri-apps/plugin-store");
          const store = await load(STORE_FILE, { autoSave: true, defaults: {} });
          await store.set(THEME_KEY, id);
          await store.save();
        } else {
          window.localStorage.setItem(THEME_KEY, id);
        }
      } catch {
        /* best-effort persistence */
      }
    })();
  }, []);

  return { themeId, setThemeId, loaded };
}
