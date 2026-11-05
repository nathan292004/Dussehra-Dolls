import { test, expect } from "@playwright/test";

const USERNAME = process.env.ADMIN_TEST_USERNAME || "admin";
const PASSWORD = process.env.ADMIN_TEST_PASSWORD || "DevAdmin123!";

// Only one admin session is live at a time (a new login signs the previous one out), so these two
// real logins must not interleave with each other or with any other admin login in the run.
test.describe.configure({ mode: "serial" });

test("rejects a bad login and then signs in with the right credentials", async ({ page }) => {
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "DollDime Admin" })).toBeVisible();

  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // A successful login swaps the login form for the sidebar + dashboard.
  await expect(page.getByText("Admin Portal")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("logout returns to the login screen", async ({ page }) => {
  await page.goto("/admin/");
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Admin Portal")).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "DollDime Admin" })).toBeVisible();
});
