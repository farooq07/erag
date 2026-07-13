import { useEffect, useRef, useState } from "react";
import type {
  LhmNode,
  SensorSnapshot,
  SensorSource,
  SensorStatus,
} from "../types";
import { extractSnapshot, snapshotSeries } from "../lib/parseLhm";
import { mockLhmTree } from "../lib/mockData";

const LHM_URL = "http://localhost:8085/data.json";
const POLL_MS = 2_000; // poll cadence when connected
const RETRY_MS = 5_000; // retry cadence while LHM is unreachable
const HISTORY_LEN = 60; // rolling samples per sensor

/** True when running inside the Tauri webview (vs. a plain browser preview). */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Fetch and parse the LHM tree. In Tauri we use the HTTP plugin so the request
 * is made from Rust and bypasses the webview's CORS/mixed-content rules; in a
 * plain browser we fall back to the built-in fetch.
 */
async function fetchLhm(): Promise<LhmNode> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const res = await tauriFetch(LHM_URL, { method: "GET" });
    if (!res.ok) throw new Error(`LHM responded ${res.status}`);
    return (await res.json()) as LhmNode;
  }
  const res = await fetch(LHM_URL);
  if (!res.ok) throw new Error(`LHM responded ${res.status}`);
  return (await res.json()) as LhmNode;
}

export interface UseSensorsResult {
  snapshot: SensorSnapshot | null;
  history: Record<string, number[]>;
  status: SensorStatus;
  source: SensorSource;
}

export interface UseSensorsOptions {
  /**
   * Force mock data. When omitted, mock is used automatically outside of Tauri
   * (browser preview) and real LHM polling is used inside the packaged app.
   */
  mock?: boolean;
}

/**
 * Poll LibreHardwareMonitor every 2s, parse the sensor tree, and keep a rolling
 * 60-sample history per sensor. On failure it surfaces a "pending" status and
 * retries every 5s. Outside Tauri (or when `mock` is set) it generates evolving
 * mock data through the same parser so the widget is fully demoable.
 */
export function useSensors(options: UseSensorsOptions = {}): UseSensorsResult {
  const useMock = options.mock ?? !isTauri();

  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null);
  const [status, setStatus] = useState<SensorStatus>("connecting");
  const historyRef = useRef<Record<string, number[]>>({});
  const [history, setHistory] = useState<Record<string, number[]>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const pushHistory = (snap: SensorSnapshot): void => {
      const next = { ...historyRef.current };
      for (const { key, value } of snapshotSeries(snap)) {
        const series = next[key] ? [...next[key], value] : [value];
        if (series.length > HISTORY_LEN) series.splice(0, series.length - HISTORY_LEN);
        next[key] = series;
      }
      historyRef.current = next;
      setHistory(next);
    };

    const tick = async (): Promise<void> => {
      try {
        const tree = useMock ? mockLhmTree() : await fetchLhm();
        if (cancelled) return;
        const snap = extractSnapshot(tree);
        setSnapshot(snap);
        pushHistory(snap);
        setStatus("connected");
        timer = setTimeout(tick, POLL_MS);
      } catch {
        if (cancelled) return;
        setStatus("pending");
        timer = setTimeout(tick, RETRY_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useMock]);

  return { snapshot, history, status, source: useMock ? "mock" : "lhm" };
}
