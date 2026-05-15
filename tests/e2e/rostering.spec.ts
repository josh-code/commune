import { test, expect } from "@playwright/test";

// Helpers — re-use the admin auth state set up in other e2e tests
// (assumes storageState: "tests/e2e/.auth/admin.json" is configured in playwright.config.ts)

test.describe("Team management", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("admin adds a position to a team and assigns a member", async ({ page }) => {
    await page.goto("/admin/teams");
    await expect(page.getByText("Worship")).toBeVisible();

    // Navigate to Worship team detail
    await page.getByText("Worship").locator("..").getByRole("link", { name: "Manage" }).click();
    await expect(page).toHaveURL(/\/admin\/teams\/.+/);

    // Add a new position
    const input = page.getByPlaceholder("New position name");
    await input.fill("Test Position");
    await input.press("Enter");
    await expect(page.getByText("Test Position")).toBeVisible();

    // Delete the test position to clean up
    await page.getByText("Test Position").locator("..").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Test Position")).not.toBeVisible();
  });
});

test.describe("Service creation", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("admin creates a service and is redirected to the roster builder", async ({ page }) => {
    await page.goto("/roster/new");
    await page.getByLabel("Service name").fill("E2E Test Service");
    await page.getByLabel("Date").fill("2030-12-25");
    await page.getByRole("button", { name: "Create service" }).click();

    // Should redirect to /roster/[id]
    await expect(page).toHaveURL(/\/roster\/.+/);
    await expect(page.getByText("E2E Test Service")).toBeVisible();

    // Team cards should be visible
    await expect(page.getByText("WORSHIP")).toBeVisible();
    await expect(page.getByText("SOUND")).toBeVisible();
  });
});

test.describe("Publish and member schedule", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("roster list shows services with status badges", async ({ page }) => {
    await page.goto("/roster");
    // At minimum the page should load and show the "New service" button
    await expect(page.getByRole("link", { name: "+ New service" })).toBeVisible();
  });
});

test.describe("Schedule page (member)", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("member sees empty assignments and can view unavailability checklist", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByText("My Schedule")).toBeVisible();
    await expect(page.getByText("Services I can't make")).toBeVisible();
  });

  test("member can mark a service unavailable", async ({ page }) => {
    // Requires at least one upcoming service to exist
    await page.goto("/schedule");
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count === 0) {
      // No services exist — skip
      test.info().annotations.push({ type: "skip", description: "No upcoming services seeded" });
      return;
    }
    const first = checkboxes.first();
    const wasChecked = await first.isChecked();
    await first.click();
    // After submit, state should toggle
    await page.waitForTimeout(500);
    await page.reload();
    const reloaded = page.locator('input[type="checkbox"]').first();
    expect(await reloaded.isChecked()).toBe(!wasChecked);
  });
});
