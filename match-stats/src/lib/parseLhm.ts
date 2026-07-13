import type {
  HwCategory,
  LhmNode,
  Reading,
  SensorLeaf,
  SensorSnapshot,
} from "../types";

/**
 * Parse a value string like `"45.5 °C"`, `"1,234 RPM"`, or `"3,591.2 RPM"`
 * into a float. Commas are treated as thousands separators (LHM uses the
 * invariant culture). Returns `null` when no number can be extracted.
 */
export function parseNumeric(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fuzzy-classify a hardware node by its name. Handles the naming variations
 * across LHM versions (e.g. "AMD Ryzen 5 7500F", "NVIDIA GeForce RTX 5060",
 * "Crucial CT1000P310SSD8"). GPU is checked before CPU so an AMD GPU is not
 * misfiled as a CPU. Returns `null` for non-hardware nodes so the caller can
 * fall back to the inherited category.
 */
export function classifyHardware(name: string | undefined): HwCategory | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (
    /(nvidia|geforce|radeon|\brtx\b|\bgtx\b|\bgpu\b|intel arc|\barc\b|quadro|\btitan\b)/.test(
      n,
    )
  ) {
    return "gpu";
  }
  if (
    /(ryzen|threadripper|epyc|athlon|\bcpu\b|processor|pentium|celeron|xeon|core i\d|core ultra|core 2)/.test(
      n,
    )
  ) {
    return "cpu";
  }
  if (
    /(nvme|\bssd\b|\bhdd\b|samsung|crucial|kingston|western digital|\bwd\b|seagate|sk ?hynix|solid state|generic hard disk|\bp3\d0\b|\bsn\d{2,}|\b9[789]0\b|\bmp\d|corsair|adata|sabrent|toshiba|micron)/.test(
      n,
    )
  ) {
    return "storage";
  }
  return null;
}

/**
 * Recursively flatten every leaf sensor in the tree, tagging each with the
 * hardware category of its nearest classified ancestor.
 */
export function flattenSensors(root: LhmNode): SensorLeaf[] {
  const out: SensorLeaf[] = [];

  const walk = (node: LhmNode, inherited: HwCategory | null): void => {
    const category = classifyHardware(node.Text) ?? inherited;
    const type = typeof node.Type === "string" ? node.Type.trim() : "";
    const hasChildren = Array.isArray(node.Children) && node.Children.length > 0;

    // A leaf sensor carries a Type + Value and has no children.
    if (type && node.Value != null && !hasChildren) {
      out.push({
        label: node.Text ?? type,
        type,
        value: parseNumeric(node.Value),
        category: category ?? "other",
      });
    }

    if (hasChildren) {
      for (const child of node.Children!) walk(child, category);
    }
  };

  walk(root, null);
  return out;
}

/** Return the first leaf whose label matches one of the patterns, by priority. */
function pick(list: SensorLeaf[], patterns: RegExp[]): SensorLeaf | undefined {
  for (const pattern of patterns) {
    const hit = list.find((l) => pattern.test(l.label));
    if (hit) return hit;
  }
  return undefined;
}

/** First leaf in the list with a usable numeric value. */
function firstValue(list: SensorLeaf[]): number | null {
  const hit = list.find((l) => l.value != null);
  return hit ? hit.value : null;
}

function valueOf(leaf: SensorLeaf | undefined): number | null {
  return leaf && leaf.value != null ? leaf.value : null;
}

/**
 * Turn a raw LHM tree into the widget-ready snapshot. All sensor lookups are
 * defensive: they match by sensor Type first, then fuzzy node/label names,
 * with sensible fallbacks so a missing or renamed sensor never throws.
 */
export function extractSnapshot(root: LhmNode): SensorSnapshot {
  const leaves = flattenSensors(root);
  const temps = leaves.filter((l) => l.type === "Temperature");
  const fanLeaves = leaves.filter((l) => l.type === "Fan");

  const cpuTemps = temps.filter((t) => t.category === "cpu");
  const gpuTemps = temps.filter((t) => t.category === "gpu");
  const storageTemps = temps.filter((t) => t.category === "storage");
  const otherTemps = temps.filter((t) => t.category === "other");

  const cpuTemp =
    valueOf(pick(cpuTemps, [/tctl\s*\/\s*tdie/i, /\btdie\b/i, /\btctl\b/i, /^cpu\b/i, /package/i])) ??
    firstValue(cpuTemps);

  const gpuTemp =
    valueOf(pick(gpuTemps, [/gpu\s*core/i, /^core$/i, /\bcore\b/i])) ??
    firstValue(gpuTemps);

  const gpuHotspot = valueOf(pick(gpuTemps, [/hot\s*spot/i, /junction/i]));

  const nvmeTemp =
    valueOf(pick(storageTemps, [/composite/i, /temperature/i, /drive/i])) ??
    firstValue(storageTemps) ??
    firstValue(otherTemps);

  // Per-core / per-CCD temps for the expanded "player stats" view.
  const coreTemps: Reading[] = cpuTemps
    .filter((t) => /(core|ccd|ccx)/i.test(t.label) && t.value != null && t.value > 0)
    .map((t) => ({
      key: `core:${t.label}`,
      label: t.label,
      value: t.value as number,
      unit: "°C" as const,
    }));

  const fans: Reading[] = fanLeaves
    .filter((f) => f.value != null && f.value > 0)
    .map((f) => {
      const prefix =
        f.category === "gpu" ? "GPU" : f.category === "cpu" ? "CPU" : "SYS";
      const label = /fan/i.test(f.label) ? f.label : `${prefix} ${f.label}`;
      return {
        key: `fan:${f.label}`,
        label,
        value: f.value as number,
        unit: "RPM" as const,
      };
    });

  return {
    cpuTemp,
    gpuTemp,
    gpuHotspot,
    nvmeTemp,
    coreTemps,
    fans,
    timestamp: Date.now(),
  };
}

/** Flatten a snapshot into (key, value) pairs for rolling-history updates. */
export function snapshotSeries(s: SensorSnapshot): { key: string; value: number }[] {
  const series: { key: string; value: number }[] = [];
  if (s.cpuTemp != null) series.push({ key: "cpu", value: s.cpuTemp });
  if (s.gpuTemp != null) series.push({ key: "gpu", value: s.gpuTemp });
  if (s.gpuHotspot != null) series.push({ key: "hotspot", value: s.gpuHotspot });
  if (s.nvmeTemp != null) series.push({ key: "nvme", value: s.nvmeTemp });
  for (const r of s.coreTemps) series.push({ key: r.key, value: r.value });
  for (const r of s.fans) series.push({ key: r.key, value: r.value });
  return series;
}
