import { test, expect } from "@playwright/test";

// PROJ-10 — Cover-Editor Browser-Smoke gegen Stage-DB.
//
// Diese E2E-Suite verifiziert:
//   - "Cover bearbeiten"-Karte ist auf der Projektübersicht sichtbar
//   - Karte rendert eine Cover-Vorschau und verlinkt auf /cover-bearbeiten
//   - Route /cover-bearbeiten lädt mit korrektem Header + Zurück-Link
//   - Alle Eingabe-Felder (Titel/Untertitel/Autor) sind vorhanden
//   - Muster- und Farb-Picker rendern mit den erwarteten Optionen
//   - Foto-Upload-Button ist sichtbar
//   - Live-Vorschau rendert ein img[role="img"] mit aktuellem Titel
//   - Anonymer Zugriff auf /cover-bearbeiten redirected zu /anmelden
//   - Fremder Project_ID-Zugriff → 404 (kein Leak)

test.use({ storageState: "tests/.auth/user.json" });

const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
const QA_PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;
const COVER_URL = `${QA_PROJECT_URL}/cover-bearbeiten`;

// ─── Einstieg von der Projektübersicht ──────────────────────────────────────

test.describe("PROJ-10 — Cover-Karte in Projektübersicht", () => {
  test("AC-Entry-1: Cover-bearbeiten-Karte ist sichtbar mit Link", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(
      page.getByRole("heading", { name: "Cover bearbeiten" }),
    ).toBeVisible();
    const editLink = page.getByRole("link", { name: /Cover-Editor öffnen/ });
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveAttribute(
      "href",
      `/projektuebersicht/${QA_PROJECT_ID}/cover-bearbeiten`,
    );
  });

  test("AC-Entry-2: Cover-Vorschau rendert mit aria-label", async ({ page }) => {
    await page.goto(QA_PROJECT_URL);
    // Die Karte enthält ein role="img" mit dem Projekt-Titel.
    const cover = page.locator('[aria-label^="Buchcover"]').first();
    await expect(cover).toBeVisible();
  });
});

// ─── Cover-Editor-Seite ──────────────────────────────────────────────────────

test.describe("PROJ-10 — Cover-Editor Route", () => {
  test("AC-Page-1: Header + Zurück-Link rendern korrekt", async ({ page }) => {
    await page.goto(COVER_URL);
    await expect(
      page.getByRole("heading", { name: "Cover bearbeiten" }),
    ).toBeVisible();
    const backLink = page.getByRole("link", {
      name: /Zurück zur Projektübersicht/,
    });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", QA_PROJECT_URL);
  });

  test("AC-Page-2: alle Eingabe-Felder sind vorhanden", async ({ page }) => {
    await page.goto(COVER_URL);
    await expect(page.getByLabel("Buchtitel")).toBeVisible();
    await expect(page.getByLabel("Untertitel")).toBeVisible();
    await expect(page.getByLabel("Autor-Zeile")).toBeVisible();
  });

  test("AC-Page-3: Muster-Picker rendert 6 Optionen", async ({ page }) => {
    await page.goto(COVER_URL);
    const themeButtons = page.getByRole("button", { name: /Muster / });
    await expect(themeButtons).toHaveCount(6);
  });

  test("AC-Page-4: Farb-Picker rendert 8 Optionen", async ({ page }) => {
    await page.goto(COVER_URL);
    const colorButtons = page.getByRole("button", { name: /Farbe / });
    await expect(colorButtons).toHaveCount(8);
  });

  test("AC-Page-5: Foto-Upload-Button sichtbar", async ({ page }) => {
    await page.goto(COVER_URL);
    await expect(
      page.getByRole("button", { name: /Foto hochladen|Foto ersetzen/ }),
    ).toBeVisible();
  });

  test("AC-Page-6: Live-Vorschau aktualisiert sich beim Tippen", async ({
    page,
  }) => {
    await page.goto(COVER_URL);
    const titleInput = page.getByLabel("Buchtitel");
    await titleInput.fill("Mein Testbuch");
    // Vorschau (role="img") sollte den neuen Titel im aria-label enthalten.
    await expect(
      page.locator('[aria-label*="Mein Testbuch"]').first(),
    ).toBeVisible();
  });

  test("AC-Page-7: Save-Status zeigt 'Gespeichert HH:MM' nach Eingabe", async ({
    page,
  }) => {
    await page.goto(COVER_URL);
    const titleInput = page.getByLabel("Buchtitel");
    await titleInput.fill(`AutoTest-${Date.now() % 100000}`);
    // Auto-Save Debounce: ~2 Sek; wir geben großzügig 6 Sek.
    await expect(page.getByText(/Gespeichert \d{2}:\d{2}/)).toBeVisible({
      timeout: 6000,
    });
  });

  test("AC-Page-8: leerer Titel zeigt Inline-Fehler", async ({ page }) => {
    await page.goto(COVER_URL);
    const titleInput = page.getByLabel("Buchtitel");
    await titleInput.fill("");
    await expect(
      page.getByText(/Titel darf nicht leer sein/),
    ).toBeVisible({ timeout: 6000 });
  });
});

// ─── Auth + Zugriff ─────────────────────────────────────────────────────────

test.describe("PROJ-10 — Auth-Gate", () => {
  test("AC-Auth-1: anonymer Zugriff → redirect zu /anmelden", async ({
    browser,
  }) => {
    // Frischer Context mit EXPLIZIT leerem Storage-State — sonst erbt
    // newContext() unter manchen Playwright-Versionen den globalen
    // storageState aus test.use(), und der Middleware-Redirect ist nicht
    // testbar.
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const p = await ctx.newPage();
    await p.goto(COVER_URL);
    await expect(p).toHaveURL(/\/anmelden/, { timeout: 8000 });
    await ctx.close();
  });

  test("AC-Auth-2: Zugriff auf fremde project_id → 404", async ({ page }) => {
    // Eine UUID, in der dieser User KEIN Mitglied ist.
    const ALIEN_ID = "11111111-2222-3333-4444-555555555555";
    await page.goto(`/projektuebersicht/${ALIEN_ID}/cover-bearbeiten`);
    // notFound() → 404-Seite
    await expect(page.getByText(/404|nicht gefunden|not found/i)).toBeVisible();
  });
});
