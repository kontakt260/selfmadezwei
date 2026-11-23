import { expect, type Browser, type Page } from "@playwright/test";

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

// Löscht Kapitel des QA-Projekts über die Projektübersicht — alle, oder nur
// die mit dem angegebenen Titel.
//
// Wartet pro Kapitel auf die Antwort der Lösch-Anfrage. Ohne dieses Warten
// verschwindet die Zeile zwar sofort aus der Liste, aber ein direkt danach
// geschlossener Browser-Kontext bricht die Anfrage ab — das Kapitel bleibt
// in der Datenbank und verfälscht nachfolgende Suites (z. B. die
// Seitenzahl-Erwartung in PROJ-7).
export async function deleteQaChapters(page: Page, title?: string): Promise<void> {
  const name = title ? `Kapitel „${title}" löschen` : /Kapitel „.*" löschen/;
  for (let guard = 0; guard < 30; guard++) {
    await page.goto(`/projektuebersicht/${QA_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");
    // PROJ-30: Hinter der Ladeansicht erscheint der Inhalt erst kurz nach `load`.
    await page.locator("main h1").first().waitFor();
    const trigger = page.getByRole("button", { name });
    if ((await trigger.count()) === 0) return;
    await trigger.first().click();
    const confirm = page.getByRole("button", { name: /Endgültig löschen/ });
    await expect(confirm).toBeEnabled({ timeout: 10_000 }); // 3-s-Countdown
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
      { timeout: 15_000 },
    );
    await confirm.click();
    await deleted;
  }
  throw new Error("QA-Kapitel ließen sich nicht löschen.");
}
