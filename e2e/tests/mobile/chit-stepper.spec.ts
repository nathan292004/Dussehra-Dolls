import { test, expect } from "@playwright/test";

// Signs in with an account the earlier specs already created (password "testpass123" for all of
// them) instead of registering a new one — sign-in needs no OTP, so no real SMS send.
const EXISTING_TEST_PHONE = process.env.CHIT_TEST_PHONE || "+919348914743";

test("the '-' and '+' stepper buttons change the chit count", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/auth");
  await page.getByPlaceholder("+91 98765 43210").fill(EXISTING_TEST_PHONE);
  await page.getByPlaceholder("••••••••").fill("testpass123");
  await page.getByText("Sign In", { exact: true }).last().click();
  await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });

  await page.getByText("Chits", { exact: true }).click();
  await expect(page.getByText("How many chits do you want?")).toBeVisible();

  const countInput = page.getByLabel("Number of chits");
  await expect(countInput).toHaveValue("2");

  await page.getByLabel("Decrease chits").click();
  await expect(countInput).toHaveValue("1");
  await page.screenshot({ path: "test-results/chit-stepper-at-1.png" });

  await page.getByLabel("Increase chits").click();
  await page.getByLabel("Increase chits").click();
  await expect(countInput).toHaveValue("3");

  // Also check the visual at a 3-digit value, since the fix gives the input a fixed width.
  await countInput.fill("100");
  await countInput.blur();
  await expect(countInput).toHaveValue("100");
  await page.screenshot({ path: "test-results/chit-stepper-at-100.png" });

  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
