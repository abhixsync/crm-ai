/**
 * E2E — Analytics page
 * Tests the range picker, metric cards, and export button.
 */
import { test, expect } from "@playwright/test";

test.describe("Analytics page", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the analytics API for predictable results
    await page.route("**/api/analytics/enhanced**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          metrics: {
            totalCustomers: 150,
            newCustomers: 12,
            totalCalls: 430,
            callsInRange: 45,
            conversions: 8,
            interested: 23,
            callSuccessRate: 72,
          },
          statusBreakdown: [
            { status: "NEW", count: 50 },
            { status: "INTERESTED", count: 23 },
            { status: "CONVERTED", count: 8 },
          ],
          campaignStats: [],
          agentLeaderboard: [],
          dailySnapshots: [],
        }),
      });
    });

    await page.goto("/admin/analytics");
    await page.waitForLoadState("networkidle");
  });

  test("renders metric cards with data", async ({ page }) => {
    await expect(page.getByText("150")).toBeVisible();
    await expect(page.getByText("430")).toBeVisible();
  });

  test("range picker buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /7d|7 day/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /30d|30 day/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /90d|90 day/i })).toBeVisible();
  });

  test("clicking range button triggers new API call with correct range param", async ({ page }) => {
    let capturedUrl = "";
    await page.route("**/api/analytics/enhanced**", async (route) => {
      capturedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          metrics: { totalCustomers: 0, newCustomers: 0, totalCalls: 0, callsInRange: 0, conversions: 0, interested: 0, callSuccessRate: 0 },
          statusBreakdown: [], campaignStats: [], agentLeaderboard: [], dailySnapshots: [],
        }),
      });
    });

    await page.getByRole("button", { name: /90d|90 day/i }).click();
    await page.waitForTimeout(500);
    expect(capturedUrl).toContain("range=90");
  });

  test("Export CSV button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /export|csv/i })).toBeVisible();
  });

  test("status breakdown is displayed", async ({ page }) => {
    await expect(page.getByText(/new/i).first()).toBeVisible();
    await expect(page.getByText(/interested/i)).toBeVisible();
  });
});
