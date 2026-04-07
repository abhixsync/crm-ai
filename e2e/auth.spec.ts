/**
 * E2E — Auth flows
 * Tests login, logout, and standalone auth pages (no shell).
 */
import { test, expect } from "@playwright/test";

// These tests run WITHOUT the saved auth state (test their own login)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login page", () => {
  test("renders standalone — no sidebar", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("nav, aside, [class*=sidebar], [class*=shell]")).toHaveCount(0);
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test("logs in with valid credentials and redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill("admin@crm.local");
    await page.getByPlaceholder(/password/i).fill("Admin@123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/admin/**", { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill("admin@crm.local");
    await page.getByPlaceholder(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Standalone auth pages — no app shell", () => {
  test("forgot-password renders without sidebar", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("nav, aside, [class*=sidebar]")).toHaveCount(0);
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test("reset-password renders without sidebar", async ({ page }) => {
    await page.goto("/reset-password?token=fake_token_for_layout_test");
    await expect(page.locator("nav, aside, [class*=sidebar]")).toHaveCount(0);
  });

  test("register page renders without sidebar", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("nav, aside, [class*=sidebar]")).toHaveCount(0);
  });
});
