import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test config.
 *
 * Requires the dev server running: `npm run dev`
 * Run tests: `npx playwright test`
 * Run with UI: `npx playwright test --ui`
 * Run headed: `npx playwright test --headed`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup: log in and save auth state
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    // Main test suite — reuses admin auth state
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],

  // Start dev server automatically if not already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
