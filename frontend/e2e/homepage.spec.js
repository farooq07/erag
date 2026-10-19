import { expect, test } from "@playwright/test";

test("homepage explains the product and the demo respects roles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }))
    .toHaveText("Answers from your documents, with the page they came from.");

  await page.getByRole("radio", { name: "What was revenue in Q3 2024?" }).click();
  await expect(page.getByText("Withheld · Finance only").first()).toBeVisible();
  // Withheld passages must not be in the page at all, not just hidden.
  await expect(page.locator("body")).not.toContainText("Closing cash balance");

  await page.getByRole("radio", { name: "Finance Director" }).click();
  await expect(page.locator("[aria-live=polite]")).toContainText("£18.4 million", { timeout: 15_000 });
});

test("homepage has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Open DocuMind goes to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open DocuMind" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
