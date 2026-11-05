import { test, expect } from "@playwright/test";
import { latestOtp } from "./db-otp";

function randomPhone(): string {
  const rest = Math.floor(100000000 + Math.random() * 899999999).toString();
  return `9${rest}`.slice(0, 10);
}

// Reproduces the exact bug: loading /auth directly (no prior screen in history), the way it
// looks after a page refresh or a bookmarked/shared link. router.back() used to be a silent
// no-op in this case, leaving a successful registration/login looking "stuck".
test("registering after navigating straight to /auth (no back-history) still leaves the screen", async ({ page }) => {
  const phone = randomPhone();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/auth"); // direct nav, not via the Profile tab's "Sign In / Register" push
  await page.getByText("Register", { exact: true }).first().click();
  await page.getByPlaceholder("First name").fill("Direct");
  await page.getByPlaceholder("Last name").fill("Navigator");
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

  // Before the fix: this would stay on /auth forever (router.back() had nowhere to go) and a
  // "GO_BACK was not handled by any navigator" console warning would fire.
  await expect(page.getByText("Direct Navigator")).toBeVisible({ timeout: 10000 });
  expect(page.url()).toContain("/profile");

  const goBackWarnings = consoleErrors.filter((e) => /GO_BACK/.test(e));
  expect(goBackWarnings, "router.back() had nowhere to go and silently failed").toEqual([]);
});

test("signing in after navigating straight to /auth also leaves the screen", async ({ page, request }) => {
  const phone = randomPhone();
  // Register via the API directly so this test only exercises the sign-in path.
  await request.post("http://localhost:3001/api/auth/send-otp", { data: { phone, purpose: "register" } });
  const otp = latestOtp(phone, "register");
  await request.post("http://localhost:3001/api/auth/register", {
    data: { fname: "Direct", lname: "Signin", phone, password: "testpass123", otp },
  });

  await page.goto("/auth");
  await page.getByPlaceholder("+91 98765 43210").fill(phone);
  await page.getByPlaceholder("••••••••").fill("testpass123");
  await page.getByText("Sign In", { exact: true }).last().click();

  await expect(page.getByText("Direct Signin")).toBeVisible({ timeout: 10000 });
  expect(page.url()).toContain("/profile");
});
