import { expect, test } from "@playwright/test";
import { ADMIN, HR, ask, signIn, waitForIndexing } from "./helpers";

// The first question after startup loads the embedding and reranker models
// (tens of seconds on a laptop CPU), so these tests get a generous budget.
test.describe.configure({ mode: "serial", timeout: 300_000 });
const FIRST_ANSWER = { timeout: 150_000 };

test("ask a question and get a cited answer", async ({ page }) => {
  await signIn(page, ADMIN);
  await waitForIndexing(page);

  await ask(page, "How many days of annual leave do full-time employees get?");
  // The fake LLM answers "From <source>: <first sentence> [1]".
  await expect(page.getByText(/From HR_Leave_Policy\.md:/)).toBeVisible(FIRST_ANSWER);
  await page.getByRole("button", { name: /^\d+ sources?$/ }).click();
  await expect(page.getByTitle("HR_Leave_Policy.md").first()).toBeVisible();
});

test("a user only gets sources from their departments", async ({ page }) => {
  await signIn(page, ADMIN);
  await waitForIndexing(page); // make sure the corpus is ready before switching user
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, HR);
  await ask(page, "What was total revenue in Q3 2024?");
  await expect(page.getByText(/^From |couldn't find/).first()).toBeVisible(FIRST_ANSWER);
  const toggle = page.getByRole("button", { name: /^\d+ sources?$/ });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTitle(/^Finance_/)).toHaveCount(0);
});
