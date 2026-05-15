// tests/e2e/auth.setup.ts
import { test as setup } from "@playwright/test";
import * as path from "path";

const adminFile  = path.join(__dirname, ".auth/admin.json");
const memberFile = path.join(__dirname, ".auth/member.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@commune.local");
  await page.getByLabel("Password").fill("commune-admin-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: adminFile });
});

setup("authenticate as member", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@commune.local");
  await page.getByLabel("Password").fill("test-pass-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: memberFile });
});
