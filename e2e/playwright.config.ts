import { defineConfig, devices } from "@playwright/test";

// Assumes the API, admin and mobile-web dev servers are already running
// (see ../README-LOCAL.md). This suite does not start them itself because
// the API needs a migrated Postgres database first.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Tests the login screen itself (good/bad credentials), so it must NOT reuse a
      // pre-authenticated session. Only one admin session is live at a time (a new login signs
      // the previous one out), so this must finish before admin-setup logs in for admin-authed —
      // otherwise its real logins would invalidate that shared session mid-run.
      name: "admin",
      testMatch: /admin\/login\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_BASE_URL || "http://localhost:5173",
      },
    },
    {
      name: "admin-setup",
      testMatch: /admin\/auth\.setup\.ts/,
      dependencies: ["admin"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_BASE_URL || "http://localhost:5173",
      },
    },
    {
      // Logs in once via admin-setup and reuses that session for every nav-item test, instead of
      // each test hitting the login rate limiter.
      name: "admin-authed",
      testMatch: /admin\/(navigation|resellers)\.spec\.ts/,
      dependencies: ["admin-setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_BASE_URL || "http://localhost:5173",
        storageState: "./.auth/admin.json",
      },
    },
    {
      name: "mobile-web",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.MOBILE_BASE_URL || "http://localhost:8081",
      },
    },
  ],
});
