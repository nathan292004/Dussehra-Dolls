import { test as setup, expect } from "@playwright/test";

const USERNAME = process.env.ADMIN_TEST_USERNAME || "admin";
const PASSWORD = process.env.ADMIN_TEST_PASSWORD || "DevAdmin123!";
const authFile = "./.auth/admin.json";

// Logs in once; every test in the "admin-authed" project reuses this session (admin auth lives in
// localStorage, not cookies) instead of hitting the login rate limiter on every single test.
setup("authenticate as admin", async ({ page }) => {
  await page.goto("/admin/");
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Admin Portal")).toBeVisible();
  await page.context().storageState({ path: authFile });
});
