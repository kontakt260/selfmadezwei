import { chromium, type FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";

export const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

export default async function globalSetup(_config: FullConfig) {
  const authDir = path.join(__dirname, ".auth");
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:3000/anmelden");
  await page.locator('input[name="email"]').fill("qa-test@narravit.de");
  await page.locator('input[name="password"]').fill("QA-Test-2026!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();

  // Wait until redirected away from /anmelden (middleware sends authed users onward)
  await page.waitForURL((url) => !url.pathname.includes("/anmelden"), { timeout: 45_000 });

  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
