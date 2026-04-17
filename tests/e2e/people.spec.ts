import { test, expect } from "@playwright/test";

const ADMIN_EMAIL    = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

function uniqueEmail() {
  return `test+${Date.now()}@commune.local`;
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("Navigation shell", () => {
  test("sidebar shows People and Admin links for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  });
});

test.describe("People list", () => {
  test("admin can view member directory", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");
    // Dev Admin is seeded — scope to main content to avoid sidebar name collision
    await expect(page.locator("main").getByText("Dev Admin")).toBeVisible();
  });

  test("search filters members by name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");
    await page.getByPlaceholder("Search members…").fill("Dev");
    await expect(page.locator("main").getByText("Dev Admin")).toBeVisible();
  });
});

test.describe("Invite with teams", () => {
  test("admin invites a member with phone and team, member appears in list", async ({
    page,
  }) => {
    const email = uniqueEmail();

    await loginAsAdmin(page);
    await page.goto("/admin/invites");

    await page.getByLabel("First name").fill("Team");
    await page.getByLabel("Last name").fill("Member");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone (optional)").fill("+61400000000");

    // Check the first team checkbox and capture its label text
    const firstTeamCheckbox = page.locator('input[name="teamId"]').first();
    // Get the team name from the checkbox's sibling text
    const teamLabel = await firstTeamCheckbox.locator("..").innerText();
    await firstTeamCheckbox.check();

    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.locator("code")).toContainText("/activate/");

    // Member should appear in people list
    await page.goto("/people");
    // Use first() in case prior test runs left multiple Team Member entries
    await expect(page.getByText("Team Member").first()).toBeVisible();

    // Find the row containing "Team Member" and assert the team name appears
    const memberRow = page.locator("a[href^='/people/']").filter({ hasText: "Team Member" }).first();
    await expect(memberRow).toContainText(teamLabel.trim());
  });
});

test.describe("Profile page", () => {
  test("admin can view profile page with tabs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");

    // Click the first member
    await page.locator("a[href^='/people/']").first().click();
    // Tab links render lowercase text with CSS capitalize — match case-insensitively
    await expect(page.getByRole("link", { name: /details/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /teams/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /history/i })).toBeVisible();
  });

  test("admin can change a member status to On Leave", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");

    // Click the first member that's not the admin (to avoid changing admin status)
    // Use Dev Admin since they're reliably seeded
    const adminRow = page.locator("main").locator("a[href^='/people/']").filter({ hasText: "Dev Admin" }).first();
    await adminRow.click();

    // Admin actions section: change status to On leave
    // The select auto-submits on change
    await page.getByLabel("Status").selectOption("on_leave");

    // Wait for the page to revalidate — the status badge in the header should update
    await expect(
      page.locator("span").filter({ hasText: /^On leave$/ })
    ).toBeVisible({ timeout: 5000 });

    // Reset back to active so other tests aren't affected
    await page.getByLabel("Status").selectOption("active");
    await expect(
      page.locator("span").filter({ hasText: /^Active$/ })
    ).toBeVisible({ timeout: 5000 });
  });

  test("admin can edit own profile and change persists on reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");

    // Click Dev Admin's row to go to their profile
    const adminRow = page.locator("main").locator("a[href^='/people/']").filter({ hasText: "Dev Admin" }).first();
    await adminRow.click();

    // Click Edit
    await page.getByRole("link", { name: "Edit" }).click();

    // Update the phone field with a unique value
    const uniquePhone = `+614${Date.now().toString().slice(-8)}`;
    await page.getByLabel("Phone").fill(uniquePhone);

    // Submit
    await page.getByRole("button", { name: "Save changes" }).click();

    // Should redirect back to profile page (no ?mode=edit in URL)
    await expect(page).not.toHaveURL(/mode=edit/);

    // Reload and verify phone persists
    await page.reload();
    await expect(page.getByText(uniquePhone)).toBeVisible();
  });
});

test.describe("CSV import", () => {
  test("admin can upload CSV and see preview", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/import");

    const csvContent = `name,email,phone,teams
Import User,import${Date.now()}@church.com,+61400000001,Worship`;

    // Upload CSV
    await page.locator('input[type="file"]').setInputFiles({
      name: "members.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Preview should show 1 member
    await expect(page.getByText("1 member ready to import")).toBeVisible();
    await expect(page.getByText("Import User")).toBeVisible();
  });
});
