import { test, expect } from "@playwright/test";
import { latestOtp } from "./db-otp";

// A fresh, random 10-digit number each run so repeat runs don't collide with
// "this number is already registered".
function randomPhone(): string {
  const rest = Math.floor(100000000 + Math.random() * 899999999).toString();
  return `9${rest}`.slice(0, 10);
}

test("a new customer can register end-to-end", async ({ page }) => {
  const phone = randomPhone();

  await page.goto("/profile");
  await page.getByText("Sign In / Register", { exact: true }).click();
  await expect(page.getByText("DollDime", { exact: true })).toBeVisible();

  await page.getByText("Register", { exact: true }).first().click();
  await page.getByPlaceholder("First name").fill("Playwright");
  await page.getByPlaceholder("Last name").fill("Tester");
  await page.getByPlaceholder("+91 98765 43210").fill(phone);
  await page.getByPlaceholder("Min. 6 characters").fill("testpass123");
  await page.getByText("Send OTP", { exact: true }).click();

  // DEV_OTP_MODE is off (real Twilio SMS goes out), so the test reads the plaintext code
  // straight out of the database instead of off the screen.
  // DEV_OTP_MODE is off, so this is a real Twilio send — slower than the old instant dev stub.
  await expect(page.getByText("Verify Your Number")).toBeVisible({ timeout: 15000 });
  const otp = latestOtp(phone, "register");

  const otpBoxes = page.locator('input[maxlength="6"]');
  await expect(otpBoxes.first()).toBeVisible();
  await otpBoxes.first().click();
  await page.keyboard.type(otp);

  await page.getByText("Verify & Create Account", { exact: true }).click();

  // A successful registration navigates back to the previous screen (Profile), now signed in.
  await expect(page.getByText("Playwright Tester")).toBeVisible();
  await expect(page.getByText("Welcome to DollDime")).not.toBeVisible();
});
