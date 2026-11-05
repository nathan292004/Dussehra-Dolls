import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Drives the Resellers portal end to end against the dev servers: add a reseller, add one of their
// dolls on the Products page, record stock received / returned, and check the numbers. Everything it
// creates is named "E2E …" and removed afterwards straight from the dev database.
const PSQL = "/opt/homebrew/opt/postgresql@17/bin/psql";
const CONN = ["-h", "127.0.0.1", "-p", "5433", "-U", "nathan", "-d", "dolldime"];
const stamp = Date.now().toString(36);
const resellerName = `E2E Reseller ${stamp}`;
const productName = `E2E Doll ${stamp}`;

function cleanup() {
  execFileSync(PSQL, [...CONN, "-q", "-c", `
    delete from reseller_stock_entries where vendor_id in (select id from vendors where name like 'E2E Reseller %');
    delete from products where name like 'E2E Doll %';
    delete from vendors where name like 'E2E Reseller %';`]);
}

test.describe.configure({ mode: "serial" });
test.afterAll(cleanup);

test("resellers portal: add a reseller, their doll, stock received and returned", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  // 1. Add the reseller
  await page.goto("/admin/resellers");
  await expect(page.getByRole("heading", { name: "Resellers", exact: true })).toBeVisible();
  await expect(page.getByText("Active resellers")).toBeVisible();
  await page.getByRole("button", { name: "Add reseller" }).first().click();
  await page.getByLabel("Business / reseller name *").fill(resellerName);
  await page.getByLabel("Contact person").fill("Asha");
  await page.getByLabel("Phone").fill("+91 98765 43210");
  await page.locator("form").getByRole("button", { name: "Add reseller" }).click();
  await expect(page.getByLabel("Business / reseller name *")).not.toBeVisible();

  // 2. Add one of their dolls with 4 units — recorded as received from them
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add Product" }).click();
  const form = page.locator("form");
  await form.locator('input[name="name"]').fill(productName);
  await form.locator('select[name="category"]').selectOption("Traditional");
  await form.locator('input[name="price"]').fill("300");
  await form.locator('input[name="stock"]').fill("4");
  await page.getByLabel("Supplied by").selectOption({ label: resellerName });
  await form.getByRole("button", { name: "Create Product" }).click();
  await expect(form).not.toBeVisible();

  // Products page filters by supplier on the server
  await page.getByLabel("Reseller").selectOption({ label: resellerName });
  const row = page.locator("tbody tr", { hasText: productName });
  await expect(row).toBeVisible();
  await expect(row).toContainText(resellerName);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // 3. Open the reseller and record stock movements
  await page.getByRole("link", { name: "Resellers", exact: true }).click();
  await page.getByRole("tab", { name: "All resellers" }).click();
  await page.getByLabel("Search resellers").fill(resellerName);
  await page.locator("tbody tr", { hasText: resellerName }).click();
  await expect(page.getByRole("group", { name: "Received: 4" })).toBeVisible();
  await expect(page.getByRole("group", { name: "On the shelf: 4" })).toBeVisible();

  await page.getByRole("button", { name: "Stock received" }).click();
  await page.getByLabel("Product").selectOption({ label: `${productName} · 4 available` });
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Note").fill("second batch");
  await page.getByRole("button", { name: "Record stock" }).click();
  await expect(page.getByRole("group", { name: "Received: 7" })).toBeVisible();

  // Returning more than is on the shelf is refused with a clear message
  await page.getByRole("button", { name: "Return stock" }).click();
  await page.getByLabel("Product").selectOption({ label: `${productName} · 7 available` });
  await page.getByLabel("Quantity").fill("9");
  await page.getByRole("button", { name: "Record return" }).click();
  await expect(page.getByRole("alert")).toContainText("Only 7 unit(s) can be returned");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Record return" }).click();
  await expect(page.getByRole("group", { name: "Returned: 2" })).toBeVisible();
  await expect(page.getByRole("group", { name: "On the shelf: 5" })).toBeVisible();
  await expect(page.getByText("second batch")).toBeVisible();
  await expect(page.getByText("−2 returned")).toBeVisible();
  // Everything was recorded through the portal, so there is no "doesn't add up" warning.
  await expect(page.getByText("Stock doesn't add up")).not.toBeVisible();

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
