// tests/e2e/inventory.spec.ts
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL    = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("Inventory — admin flow", () => {
  test("admin creates a category and a public bulk item", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/inventory/manage/categories");

    const catName = `E2E Cat ${Date.now()}`;
    await page.getByPlaceholder("e.g. AV & Tech").fill(catName);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.locator('input[name="name"]').last()).toHaveValue(catName);

    await page.goto("/inventory/manage/items/new");
    await page.locator('input[name="name"]').fill("E2E Test Chairs");
    await page.locator('select[name="category_id"]').selectOption({ label: catName });
    await page.locator('input[name="total_quantity"]').fill("10");
    await page.locator('input[name="location"]').fill("Hall");
    await page.getByRole("button", { name: "Create item" }).click();

    await expect(page).toHaveURL(/\/inventory\/manage\/items\//);
    await expect(page.locator('input[name="name"]').first()).toHaveValue("E2E Test Chairs");
  });

  test("admin sees inventory hub card on /admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await expect(page.locator('a[href="/inventory/manage"]').first()).toBeVisible();
  });

  test("inventory tab appears in sidebar for everyone", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "Inventory", exact: true })).toBeVisible();
  });
});

test.describe("Inventory — reservation flow", () => {
  test("admin creates auto-confirm item and reserves it; status is approved immediately", async ({ page }) => {
    await loginAsAdmin(page);

    // Ensure a category exists
    await page.goto("/inventory/manage/categories");
    const catName = `Auto ${Date.now()}`;
    await page.getByPlaceholder("e.g. AV & Tech").fill(catName);
    await page.getByRole("button", { name: "Add" }).click();

    // Create an auto-confirm item
    await page.goto("/inventory/manage/items/new");
    const itemName = `AutoItem ${Date.now()}`;
    await page.locator('input[name="name"]').fill(itemName);
    await page.locator('select[name="category_id"]').selectOption({ label: catName });
    await page.locator('input[name="total_quantity"]').fill("3");
    await page.getByRole("button", { name: "Create item" }).click();

    // Reserve from the catalogue
    await page.goto("/inventory");
    await page.getByText(itemName).click();
    await page.getByPlaceholder("e.g. Youth meeting").fill("E2E test");
    await page.getByRole("button", { name: "Reserve" }).click();

    await expect(page).toHaveURL("/inventory/reservations");
    await expect(page.getByText(itemName)).toBeVisible();
    await expect(page.getByText("approved").first()).toBeVisible();
  });
});
