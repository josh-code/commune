// tests/e2e/recurring.spec.ts
import { test, expect } from "@playwright/test";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@commune.local");
  await page.getByLabel("Password").fill("commune-admin-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@commune.local");
  await page.getByLabel("Password").fill("test-pass-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("Service templates", () => {
  test("admin creates a weekly template and services are generated", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/roster/templates/new");
    await expect(page.getByText("New recurring service")).toBeVisible();

    await page.getByLabel("Service name").fill("E2E Sunday Service");
    await page.getByLabel("Repeats").selectOption("weekly");
    await page.getByLabel("Day of week").selectOption("0"); // Sunday
    await page.getByLabel("Generate ahead (services)").fill("4");

    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page).toHaveURL("/roster/templates");
    await expect(page.getByText("E2E Sunday Service")).toBeVisible();
    await expect(page.getByText("4 upcoming")).toBeVisible();
  });

  test("templates page shows Generate 8 more button", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/roster/templates");
    await expect(page.getByRole("button", { name: "Generate 8 more" }).first()).toBeVisible();
  });

  test("roster list page shows templates shortcut", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/roster");
    await expect(page.getByRole("link", { name: /View templates/ })).toBeVisible();
  });
});

test.describe("Date range unavailability (member)", () => {
  test("member sees Dates I'm away section on schedule page", async ({ page }) => {
    await loginAsMember(page);
    await page.goto("/schedule");
    await expect(page.getByText("Dates I'm away")).toBeVisible();
  });

  test("member can add and remove a date range", async ({ page }) => {
    await loginAsMember(page);
    await page.goto("/schedule");

    // Add a range
    await page.getByLabel("From", { exact: true }).fill("2030-08-01");
    await page.getByLabel("To", { exact: true }).fill("2030-08-14");
    await page.getByPlaceholder("Reason (optional)").fill("Holiday");
    await page.getByRole("button", { name: "Mark unavailable" }).click();

    // Range appears in list
    await expect(page.getByText("Holiday")).toBeVisible();

    // Remove it — select the range row via "Select all" then click Delete
    await page.getByLabel("Select all").check();
    await page.getByRole("button", { name: /Delete/ }).click();
    await expect(page.getByText("Holiday")).not.toBeVisible();
  });
});
