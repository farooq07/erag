import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { ADMIN, signIn } from "./helpers";

test("upload from the composer's + menu shows a chip until the file is indexed", async ({ page }) => {
  test.setTimeout(200_000);
  await signIn(page, ADMIN);

  await page.getByRole("button", { name: "Add files and more" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /Upload files/ }).click();
  await (await chooser).setFiles({
    name: "Parking_Rules.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Parking\n\nStaff park in level 2 of the North garage. Visitor spaces are on level 1.\n"),
  });

  const chip = page.getByTitle("Parking_Rules.md");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Ready", { timeout: 150_000 });

  await page.getByRole("button", { name: "Remove Parking_Rules.md" }).click();
  await expect(chip).toHaveCount(0);
});
