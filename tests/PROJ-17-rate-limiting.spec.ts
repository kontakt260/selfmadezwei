import { expect, test, type Page } from "@playwright/test";

// PROJ-17 — Rate-Limit beim Login gegen die echte Zähler-Tabelle auf Stage.
//
// Läuft nur gezielt, weil die übrigen Suites die Limits abschalten:
//   E2E_RATE_LIMIT=1 npx playwright test tests/PROJ-17-rate-limiting.spec.ts --project=chromium
//
// Eigene IP und Adresse pro Lauf: Die Zähler bleiben sonst bis zu einer Stunde
// stehen. Die Adresse existiert nicht, es wird kein echtes Konto berührt.

const part = () => Math.floor(Math.random() * 254) + 1;
const testIp = `198.18.${part()}.${part()}`;
const testEmail = `rate-limit-${Date.now()}@example.com`;

test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { "x-forwarded-for": testIp },
});
test.skip(process.env.E2E_RATE_LIMIT !== "1", "Nur mit E2E_RATE_LIMIT=1");
test.skip(({ isMobile }) => isMobile, "Eine Plattform genügt für die Zähler.");

async function failedLogin(page: Page) {
  await page.locator('input[name="email"]').fill(testEmail);
  await page.locator('input[name="password"]').fill("falsches-passwort");
  const answer = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/anmelden"),
  );
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await answer;
}

test("AC-Limit-1: Der sechste Fehlversuch von derselben IP wird gesperrt", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/anmelden");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await failedLogin(page);
    await expect(page.getByText("E-Mail oder Passwort falsch.")).toBeVisible();
  }

  await failedLogin(page);
  await expect(page.getByText(/Zu viele Versuche/)).toBeVisible();
});
