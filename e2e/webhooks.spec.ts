/**
 * E2E — Webhooks page
 * Tests webhook creation, test payload, delivery log display, and retry.
 */
import { test, expect } from "@playwright/test";

test.describe("Webhooks page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/webhooks");
    await page.waitForLoadState("networkidle");
  });

  test("page renders with New Webhook button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new webhook/i })).toBeVisible();
    await expect(page.getByText(/webhooks/i).first()).toBeVisible();
  });

  test("New Webhook button opens creation form", async ({ page }) => {
    await page.getByRole("button", { name: /new webhook/i }).click();
    await expect(page.getByPlaceholder(/slack notifications/i)).toBeVisible();
    await expect(page.getByPlaceholder(/https:\/\/your-endpoint/i)).toBeVisible();
  });

  test("form validates required fields", async ({ page }) => {
    await page.getByRole("button", { name: /new webhook/i }).click();
    await page.getByRole("button", { name: /create webhook/i }).click();
    // HTML5 required validation prevents submission — name field should be focused
    const nameInput = page.getByPlaceholder(/slack notifications/i);
    await expect(nameInput).toBeFocused();
  });

  test("Cancel button closes creation form", async ({ page }) => {
    await page.getByRole("button", { name: /new webhook/i }).click();
    await expect(page.getByText(/new webhook/i).nth(1)).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByPlaceholder(/slack notifications/i)).not.toBeVisible();
  });

  test("can create a webhook end-to-end", async ({ page }) => {
    // Intercept API calls
    await page.route("**/api/admin/webhooks", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            webhook: {
              id: "wh-e2e-test",
              name: "E2E Test Webhook",
              url: "https://httpbin.org/post",
              events: ["call.completed"],
              enabled: true,
              logs: [],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: /new webhook/i }).click();
    await page.getByPlaceholder(/slack notifications/i).fill("E2E Test Webhook");
    await page.getByPlaceholder(/https:\/\/your-endpoint/i).fill("https://httpbin.org/post");

    // Select at least one event
    await page.getByText("call.completed").click();

    await page.getByRole("button", { name: /create webhook/i }).click();

    // Webhook should appear in list
    await expect(page.getByText("E2E Test Webhook")).toBeVisible({ timeout: 5_000 });
  });

  test("existing webhook shows Test button", async ({ page }) => {
    // Mock existing webhooks
    await page.route("**/api/admin/webhooks**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            webhooks: [{
              id: "wh-existing",
              name: "My Webhook",
              url: "https://example.com/hook",
              events: ["call.completed"],
              enabled: true,
              logs: [],
            }],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /^test$/i })).toBeVisible();
  });

  test("expanding webhook shows delivery log section", async ({ page }) => {
    await page.route("**/api/admin/webhooks", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            webhooks: [{
              id: "wh-with-logs",
              name: "Logged Webhook",
              url: "https://example.com/hook",
              events: ["call.completed"],
              enabled: true,
              logs: [
                { id: "log1", event: "call.completed", success: true, statusCode: 200, createdAt: new Date().toISOString() },
                { id: "log2", event: "call.failed", success: false, statusCode: 500, createdAt: new Date().toISOString() },
              ],
            }],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Click on webhook to expand
    await page.getByText("Logged Webhook").click();

    await expect(page.getByText(/delivery log/i)).toBeVisible();
    await expect(page.getByText("call.completed")).toBeVisible();
    // Failed log should have Retry button
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
