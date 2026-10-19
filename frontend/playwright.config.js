// End-to-end tests against the real backend serving the built frontend.
// The backend runs with the fake LLM and a throwaway data directory, so
// tests never touch data/ or call Groq. Run: npm run build && npm run e2e
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 8001;
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "documind-e2e-"));
const toPosix = (p) => p.split(path.sep).join("/");

// Locally use the installed Chrome; CI installs Playwright's Chromium.
const browser = process.env.CI ? {} : { channel: "chrome" };

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one backend and one database: keep runs sequential
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], ...browser, viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `python -m uvicorn main:app --port ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/readyz`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      LLM_PROVIDER: "fake",
      RATE_LIMITS_ENABLED: "false",
      JWT_SECRET: "e2e-secret",
      DOCUMIND_ENV: "test",
      DOCUMIND_DATA_DIR: path.join(dataRoot, "data"),
      DATABASE_URL: `sqlite:///${toPosix(path.join(dataRoot, "e2e.db"))}`,
      APP_BASE_URL: `http://localhost:${PORT}`,
      ALLOWED_ORIGINS: `http://localhost:${PORT}`,
    },
  },
});
