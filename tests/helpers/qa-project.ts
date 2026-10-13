import { expect, type Browser } from "@playwright/test";

// Gemeinsame Konstanten + Helfer für das QA-Testprojekt in der Stage-DB.
// Alle E2E-Suites teilen sich dieses eine Projekt — wer daran etwas
// verändert (z. B. den Titel über den Cover-Editor), muss es danach
// wieder in den Ausgangszustand bringen.

export const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
export const QA_PROJECT_TITLE = "QA-Testprojekt";

const COVER_URL = `/projektuebersicht/${QA_PROJECT_ID}/cover-bearbeiten`;

// Setzt den Projekttitel über den Cover-Editor auf den Seed-Wert zurück.
// Der Cover-Editor speichert per Auto-Save direkt in projects.title; ohne
// dieses Zurücksetzen schlagen alle Tests fehl, die den Titel prüfen
// (PROJ-4 AC-Home-*, AC-PÜ-1).
export async function restoreQaProjectTitle(browser: Browser) {
  const ctx = await browser.newContext({ storageState: "tests/.auth/user.json" });
  const page = await ctx.newPage();
  try {
    await page.goto(COVER_URL);
    const titleInput = page.getByLabel("Buchtitel");
    await expect(titleInput).toBeVisible({ timeout: 15_000 });
    if ((await titleInput.inputValue()) !== QA_PROJECT_TITLE) {
      await titleInput.fill(QA_PROJECT_TITLE);
      await expect(page.getByText(/Gespeichert \d{2}:\d{2}/)).toBeVisible({
        timeout: 15_000,
      });
    }
  } finally {
    await ctx.close();
  }
}
