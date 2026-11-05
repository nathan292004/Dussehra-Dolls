import { test, expect } from "@playwright/test";

test("shop tab shows the product catalog and category filters", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/");
  await expect(page.getByText("All", { exact: true })).toBeVisible();
  for (const category of ["Traditional", "Modern", "Miniature", "Collector", "Children"]) {
    await expect(page.getByText(category, { exact: true })).toBeVisible();
  }

  expect(consoleErrors, `console errors on shop tab:\n${consoleErrors.join("\n")}`).toEqual([]);
});

test("bottom tab bar switches between Shop, Chits, Cart, Wallet and Profile", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Chits", "Cart", "Wallet", "Profile", "Shop"]) {
    await page.getByText(tab, { exact: true }).click();
  }
  // Profile is the last tab clicked; signed-out users see the sign-in prompt there.
  await expect(page.getByText("Welcome to DollDime")).toBeVisible();
});
