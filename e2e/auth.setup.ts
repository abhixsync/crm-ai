/**
 * Auth setup — runs once before all E2E tests.
 * Logs in as admin and saves browser storage state so tests
 * don't have to log in individually.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");

  await page.getByPlaceholder(/email/i).fill(process.env.E2E_ADMIN_EMAIL || "admin@crm.local");
  await page.getByPlaceholder(/password/i).fill(process.env.E2E_ADMIN_PASSWORD || "Admin@123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/admin/dashboard", { timeout: 15_000 });
  await expect(page).toHaveURL(/admin\/dashboard/);

  // Save signed-in state
  await page.context().storageState({ path: AUTH_FILE });
});
