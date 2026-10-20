import { expect, test } from "@playwright/test";
import { ADMIN, signIn, signOut } from "./helpers";

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
});

test("sign in, reload keeps the session, sign out returns home", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(ADMIN.name);

  await page.reload(); // access token is in memory only; the refresh cookie restores it
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(ADMIN.name);

  await signOut(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
