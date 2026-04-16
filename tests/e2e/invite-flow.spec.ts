import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

function uniqueEmail() {
  return `test+${Date.now()}@commune.local`;
}

test.describe("Invite → activate → login flow", () => {
  test("admin can invite a member who activates and signs in", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const newPassword = "invited-pass-123";

    // 1. Admin signs in
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    // 2. Admin sends invite
    await page.goto("/admin/invites");
    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("Invitee");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();

    const inviteCode = page.locator("code");
    await expect(inviteCode).toContainText("/activate/");
    const inviteUrl = (await inviteCode.textContent())!.trim();

    // 3. Admin signs out
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // 4. Invitee activates
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByText("Account activated"),
    ).toBeVisible();

    // 5. Invitee signs in
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading")).toContainText("Welcome, Test");
  });

  test("activation rejects reused tokens", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/admin/invites");
    await page.getByLabel("First name").fill("Reuse");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    const inviteUrl = (await page.locator("code").textContent())!.trim();
    await page.getByRole("button", { name: "Sign out" }).click();

    // First activation succeeds
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill("reuse-pass-123");
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByText("Account activated"),
    ).toBeVisible();

    // Reuse the same URL
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill("reuse-pass-456");
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByText("Invite not found or already used."),
    ).toBeVisible();
  });
});
