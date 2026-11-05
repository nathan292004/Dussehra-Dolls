import { test, expect } from "@playwright/test";

// Every item in the sidebar (artifacts/admin/src/components/layout.tsx). Each should load
// without the console throwing and without the page silently falling back to the 404 screen —
// this is what would have caught the admin-whatsapp.ts / admin-chits.ts SQL field-name bugs
// introduced during the merge.
const NAV_ITEMS = [
  "Dashboard",
  "Products",
  "Resellers",
  "Inventory",
  "Orders",
  "Users",
  "Chit Approvals",
  "Chit Subscriptions",
  "Reminders & Tracking",
  "Wallets",
  "WhatsApp Promotions",
];

for (const label of NAV_ITEMS) {
  test(`"${label}" loads without console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/admin/");
    await expect(page.getByText("Admin Portal")).toBeVisible();
    await page.getByRole("link", { name: label, exact: true }).click();

    // The sidebar persists across every route; its absence means the app crashed to a blank page.
    await expect(page.getByText("Admin Portal")).toBeVisible();
    await expect(page.getByText("404 - Page Not Found")).not.toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(consoleErrors, `console errors on "${label}":\n${consoleErrors.join("\n")}`).toEqual([]);
  });
}
