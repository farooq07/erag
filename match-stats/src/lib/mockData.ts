import type { LhmNode } from "../types";

/**
 * Build a LibreHardwareMonitor-shaped tree for the target rig
 * (Ryzen 5 7500F / RTX 5060 / Crucial P310). The values are generated from a
 * slow triangle wave so the widget visibly cycles cool → hot → cool over about
 * a minute — exercising the temperature colors, football speed and commentary.
 *
 * Because this returns the same node shape LHM serves, it flows through the
 * exact same parser as real data.
 */

function temp(text: string, celsius: number): LhmNode {
  const v = celsius.toFixed(1);
  return {
    Text: text,
    Type: "Temperature",
    Value: `${v} °C`,
    Min: `${v} °C`,
    Max: `${v} °C`,
  };
}

function fan(text: string, rpm: number): LhmNode {
  const v = Math.round(rpm).toLocaleString("en-US");
  return { Text: text, Type: "Fan", Value: `${v} RPM` };
}

function group(text: string, children: LhmNode[]): LhmNode {
  return { Text: text, Children: children };
}

/** 0 → 1 → 0 triangle wave over `periodMs`, offset by `phase` (0..1). */
function wave(now: number, periodMs: number, phase: number): number {
  const t = ((now / periodMs + phase) % 1 + 1) % 1;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

const rand = (spread: number) => (Math.random() - 0.5) * spread;

/**
 * Test seam: a screenshot/e2e harness can freeze the mock cycle by setting
 * `window.__MS_MOCK_NOW` to a fixed millisecond offset. Ignored in normal use.
 */
function overrideNow(): number | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as { __MS_MOCK_NOW?: number }).__MS_MOCK_NOW;
}

export function mockLhmTree(now: number = overrideNow() ?? Date.now()): LhmNode {
  // Cycle roughly every 60s; CPU and GPU peak slightly out of phase.
  const cpuLoad = wave(now, 60_000, 0);
  const gpuLoad = wave(now, 60_000, 0.35);

  const cpuBase = 38 + cpuLoad * 52 + rand(1.2); // ~38 → ~90 °C
  const gpuCore = 40 + gpuLoad * 48 + rand(1.2); // ~40 → ~88 °C
  const gpuHot = gpuCore + 8 + rand(1.5);
  const nvme = 34 + gpuLoad * 22 + rand(0.8); // ~34 → ~56 °C

  const cpuFan = 800 + cpuLoad * 1300 + rand(60);
  const gpuFan = 900 + gpuLoad * 1700 + rand(80);
  const sysFan = 600 + Math.max(cpuLoad, gpuLoad) * 900 + rand(50);

  return {
    id: 0,
    Text: "Sensor",
    Children: [
      group("MOCK-DESKTOP", [
        // ---- CPU ----
        group("AMD Ryzen 5 7500F", [
          group("Temperatures", [
            temp("Core (Tctl/Tdie)", cpuBase),
            temp("CCD1 (Tdie)", cpuBase - 2 + rand(0.6)),
            temp("Core #1", cpuBase - 1 + rand(1.5)),
            temp("Core #2", cpuBase - 0.5 + rand(1.5)),
            temp("Core #3", cpuBase + rand(1.5)),
            temp("Core #4", cpuBase - 1.5 + rand(1.5)),
            temp("Core #5", cpuBase + 0.5 + rand(1.5)),
            temp("Core #6", cpuBase - 0.8 + rand(1.5)),
          ]),
          group("Fans", [fan("CPU Fan", cpuFan)]),
        ]),
        // ---- GPU ----
        group("NVIDIA GeForce RTX 5060", [
          group("Temperatures", [
            temp("GPU Core", gpuCore),
            temp("GPU Hot Spot", gpuHot),
            temp("GPU Memory Junction", gpuCore + 4 + rand(1)),
          ]),
          group("Fans", [fan("GPU Fan", gpuFan)]),
        ]),
        // ---- Storage ----
        group("Crucial CT1000P310SSD8", [
          group("Temperatures", [temp("Temperature", nvme)]),
        ]),
        // ---- Motherboard chassis fan ----
        group("Motherboard", [group("Fans", [fan("System Fan #1", sysFan)])]),
      ]),
    ],
  };
}
