/** Shared types for the sensor data layer. */

/**
 * A raw node in LibreHardwareMonitor's `/data.json` tree.
 *
 * The tree mixes hardware nodes (CPU, GPU, storage — identified by `Text`),
 * sensor-group nodes ("Temperatures", "Fans", …) and leaf sensor nodes
 * (which carry a `Type` and a stringly-typed `Value` like `"45.5 °C"`).
 * Field names and casing follow LHM's JSON exactly; every field is optional
 * because different LHM versions omit different keys.
 */
export interface LhmNode {
  id?: number;
  Text?: string;
  Type?: string;
  Value?: string | number;
  Min?: string | number;
  Max?: string | number;
  SensorId?: string;
  ImageURL?: string;
  Children?: LhmNode[];
}

/** Which piece of hardware a sensor belongs to. */
export type HwCategory = "cpu" | "gpu" | "storage" | "other";

/** A flattened sensor leaf with its resolved hardware category. */
export interface SensorLeaf {
  label: string;
  type: string;
  value: number | null;
  category: HwCategory;
}

/** A single displayable reading (temperature or fan speed). */
export interface Reading {
  /** Stable key used to index rolling history. */
  key: string;
  label: string;
  value: number;
  unit: "°C" | "RPM";
}

/** The parsed, widget-ready view of one poll of the sensor tree. */
export interface SensorSnapshot {
  cpuTemp: number | null; // AMD Tctl/Tdie (or fallback CPU temp)
  gpuTemp: number | null; // NVIDIA GPU Core
  gpuHotspot: number | null; // NVIDIA GPU Hot Spot, if present
  nvmeTemp: number | null; // storage temperature
  coreTemps: Reading[]; // per-core / per-CCD CPU temps
  fans: Reading[]; // CPU + GPU + chassis fan RPMs
  timestamp: number;
}

/** Connection state of the data layer. */
export type SensorStatus = "connecting" | "connected" | "pending";

/** Where the current snapshot came from. */
export type SensorSource = "lhm" | "mock";
