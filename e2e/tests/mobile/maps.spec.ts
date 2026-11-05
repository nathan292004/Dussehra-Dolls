import { test, expect } from "@playwright/test";
import { latestOtp } from "./db-otp";

function randomPhone(): string {
  const rest = Math.floor(100000000 + Math.random() * 899999999).toString();
  return `9${rest}`.slice(0, 10);
}

async function registerAndSignIn(page: import("@playwright/test").Page) {
  const phone = randomPhone();
  await page.goto("/profile");
  await page.getByText("Sign In / Register", { exact: true }).click();
  await page.getByText("Register", { exact: true }).first().click();
  await page.getByPlaceholder("First name").fill("Maps");
  await page.getByPlaceholder("Last name").fill("Tester");
  await page.getByPlaceholder("+91 98765 43210").fill(phone);
  await page.getByPlaceholder("Min. 6 characters").fill("testpass123");
  await page.getByText("Send OTP", { exact: true }).click();
  // DEV_OTP_MODE is off, so this is a real Twilio send — slower than the old instant dev stub.
  await expect(page.getByText("Verify Your Number")).toBeVisible({ timeout: 15000 });
  const otp = latestOtp(phone, "register");
  const otpBoxes = page.locator('input[maxlength="6"]');
  await otpBoxes.first().click();
  await page.keyboard.type(otp);
  await page.getByText("Verify & Create Account", { exact: true }).click();
  await expect(page.getByText("Maps Tester")).toBeVisible();
}

test("the Google Maps address picker loads a real map, not the missing-key message", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await registerAndSignIn(page);

  await page.getByText("Addresses", { exact: true }).click();
  await expect(page.getByText("Your Addresses")).toBeVisible();
  await page.getByText("Add a new address", { exact: true }).click();

  // The picker shows this exact message when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing/unset.
  await expect(page.getByText("Google Maps needs an API key")).not.toBeVisible();

  const frame = page.frameLocator('iframe[title="Choose delivery location on Google Maps"]');
  await expect(frame.locator("#map")).toBeVisible({ timeout: 15000 });
  // Google's own tiles/markers render as canvas + divs with this class once the JS API has loaded.
  await expect(frame.locator(".gm-style")).toBeVisible({ timeout: 15000 });

  await page.screenshot({ path: "test-results/address-map-picker.png", fullPage: true });

  const mapErrors = consoleErrors.filter((e) => /google|maps|geocod/i.test(e));
  expect(mapErrors, `Google Maps related console errors:\n${mapErrors.join("\n")}`).toEqual([]);
});
