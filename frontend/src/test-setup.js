import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no matchMedia. Report "reduced motion" so animated components
// (the homepage demo) render their final state immediately.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
