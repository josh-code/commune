import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

/** Returns a date string YYYY-MM-DD that is N days from today */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

test.describe("Roster Grid – edit mode", () => {
  test("cells become editable after toggling edit mode, and CellPopover opens", async ({ page }) => {
    await loginAsAdmin(page);

    // Create a test service 7 days from now so it falls in the default grid range
    await page.goto("/roster/new");
    const serviceDate = daysFromToday(7);
    await page.getByLabel("Service name").fill("Grid Edit E2E Test");
    await page.getByLabel("Date").fill(serviceDate);
    await page.getByRole("button", { name: "Create service" }).click();

    // Should redirect to roster builder for this service
    await expect(page).toHaveURL(/\/roster\/.+/);

    // Navigate to the grid
    await page.goto("/roster/grid");
    await page.waitForLoadState("networkidle");

    // Confirm we see the service (not the "no services" empty state)
    await expect(page.getByText("No services in this date range")).not.toBeVisible();
    await expect(page.getByText("Grid Edit E2E Test")).toBeVisible();

    // ── Before edit mode ──────────────────────────────────────────────────────
    const toggleBtn = page.getByRole("button", { name: "View only" });
    await expect(toggleBtn).toBeVisible();

    // No cells should have cursor-pointer yet
    const editableBefore = page.locator("tbody td.cursor-pointer");
    await expect(editableBefore).toHaveCount(0);

    // ── Enable edit mode ──────────────────────────────────────────────────────
    await toggleBtn.click();
    await expect(page.getByRole("button", { name: "Editing" })).toBeVisible();
    await page.screenshot({ path: "test-results/grid-editing-mode.png" });

    // Cells should now be cursor-pointer (slots pre-populated in page.tsx)
    const editableAfter = page.locator("tbody td.cursor-pointer");
    const count = await editableAfter.count();
    console.log(`Editable cells after toggle: ${count}`);
    expect(count).toBeGreaterThan(0);

    // ── Click a cell and verify CellPopover opens ─────────────────────────────
    await editableAfter.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: "test-results/grid-cell-popover.png" });

    // Close with X
    await dialog.getByRole("button").filter({ has: page.locator("svg") }).first().click();
    await expect(dialog).not.toBeVisible();

    // ── Cleanup: delete test service ──────────────────────────────────────────
    // (navigate away — no explicit delete needed for e2e purposes)
  });
});
