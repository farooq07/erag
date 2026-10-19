import { expect } from "@playwright/test";

export const ADMIN = { email: "admin@acme.com", password: "Admin123!", name: "Alex Admin" };
export const HR = { email: "hr@acme.com", password: "Demo123!" };

export async function signIn(page, { email, password }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// The demo corpus is indexed in the background on first start; wait until
// no document in the sidebar is still queued or indexing.
// The files list lives in a side panel opened from the icon rail; it's closed
// again afterwards so it doesn't cover the chat or match source-card queries.
export async function waitForIndexing(page) {
  await page.getByRole("button", { name: /^Files \(/ }).click();
  await expect(page.getByTitle("HR_Leave_Policy.md").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^(Queued|Indexing…)$/)).toHaveCount(0, { timeout: 150_000 });
  await page.getByRole("button", { name: "Close panel" }).click();
}

export async function ask(page, question) {
  const box = page.getByPlaceholder(/Ask a question about your documents/);
  await box.fill(question);
  await box.press("Enter");
}
