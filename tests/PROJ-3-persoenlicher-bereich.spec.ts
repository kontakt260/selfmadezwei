import { test, expect } from "@playwright/test";

// All tests in this file run as the stage QA test user (qa-test@narravit.de).
// Auth state is created by globalSetup (tests/global-setup.ts) and stored in
// tests/.auth/user.json. The test user has one project with portal_access_expires_at
// set to now() + 365 days — so the middleware grants full access.
test.use({ storageState: "tests/.auth/user.json" });

// ─── Seite & Layout ────────────────────────────────────────────────────────────

test.describe("PROJ-3 — Seite & Layout", () => {
  test("AC-1: /persoenlicher-bereich lädt für eingeloggten Nutzer mit aktivem Zugang", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await expect(page).toHaveURL(/\/persoenlicher-bereich/);
    await expect(page.getByRole("heading", { name: "Persönlicher Bereich", level: 1 })).toBeVisible();
  });

  test("AC-2: Banner-Bild und Seitenüberschrift mit Untertitel sichtbar", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    const banner = page.locator('img[alt*="Banner"]');
    await expect(banner).toBeVisible();
    await expect(page.getByRole("heading", { name: "Persönlicher Bereich", level: 1 })).toBeVisible();
    await expect(page.getByText(/verwalten Sie die wichtigsten/)).toBeVisible();
  });

  test("AC-3: Alle 4 Sektionen in korrekter Reihenfolge vorhanden", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings.nth(0)).toHaveText("Account Übersicht");
    await expect(headings.nth(1)).toHaveText("Rechnungen");
    await expect(headings.nth(2)).toHaveText("Sicherheit");
    await expect(headings.nth(3)).toHaveText("Account löschen");
  });
});

// ─── Account-Übersicht ─────────────────────────────────────────────────────────

test.describe("PROJ-3 — Account-Übersicht", () => {
  test("AC-4: Name-Feld zeigt aktuellen Wert und ist editierbar", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue("QA Testkonto");
    await expect(nameInput).not.toHaveAttribute("readonly");
  });

  test("AC-5: E-Mail-Feld zeigt aktuelle E-Mail und ist read-only mit Support-Hinweis", async ({ page }) => {
    // Refine 2026-05-21: E-Mail-Self-Service-Edit wurde via revert
    // 02cf7d8 zurückgenommen — bis ein sauberer Recovery-Flow steht,
    // läuft Mail-Wechsel über Support.
    await page.goto("/persoenlicher-bereich");
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveValue("qa-test@narravit.de");
    await expect(emailInput).toHaveAttribute("readonly", "");
    await expect(
      page.getByText(/wenden Sie sich bitte an den Support/i).first(),
    ).toBeVisible();
  });

  test("AC-7: Name speichern — zu kurzer Name zeigt Validierungsfehler", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill("A");
    await page.getByRole("button", { name: "Name speichern" }).click();
    await expect(page.getByText(/mindestens 2 Zeichen/)).toBeVisible();
  });
});

// ─── Rechnungen ────────────────────────────────────────────────────────────────

test.describe("PROJ-3 — Rechnungen", () => {
  test("AC-11: Rechnungen-Sektion zeigt Platzhalter 'Noch keine Rechnungen vorhanden'", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await expect(page.getByText("Noch keine Rechnungen vorhanden.")).toBeVisible();
  });

  test("AC-12: Rechnungstabelle hat korrekte Spaltenheader", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await expect(page.getByText("Datum", { exact: true })).toBeVisible();
    await expect(page.getByText("Betrag", { exact: true })).toBeVisible();
    await expect(page.getByText("Typ", { exact: true })).toBeVisible();
    await expect(page.getByText("Rechnung", { exact: true })).toBeVisible();
  });
});

// ─── Sicherheit ────────────────────────────────────────────────────────────────

test.describe("PROJ-3 — Sicherheit", () => {
  test("AC-13: E-Mail-Nutzer sieht 'Passwort zurücksetzen'-Button", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    // QA test user uses email provider
    await expect(page.getByRole("button", { name: "Passwort zurücksetzen" })).toBeVisible();
  });

  test("AC-14: Passwort-zurücksetzen zeigt Bestätigungshinweis nach Klick", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await page.getByRole("button", { name: "Passwort zurücksetzen" }).click();
    await expect(page.getByText(/Link zum Zurücksetzen/)).toBeVisible();
    // Button becomes disabled after success
    await expect(page.getByRole("button", { name: "Passwort zurücksetzen" })).toBeDisabled();
  });
});

// ─── Account löschen ───────────────────────────────────────────────────────────

test.describe("PROJ-3 — Account löschen", () => {
  // Delete-Trigger-Button heißt seit Refine 2026-05-21 schlicht
  // „Account löschen" (das ausführliche „unwiderruflich" steht im
  // Sektions-Text + Dialog-Body, nicht im Button-Label). Exact-Match
  // verhindert Verwechslung mit dem Section-Heading gleichen Namens.
  const triggerSelector = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Account löschen", exact: true });

  test("AC-15: Löschen-Button öffnet AlertDialog", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await triggerSelector(page).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("Account wirklich löschen?")).toBeVisible();
  });

  test("AC-16: Löschen-Button im Dialog ist deaktiviert bis 'LÖSCHEN' eingetippt", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await triggerSelector(page).click();

    const submitBtn = page.getByRole("button", { name: "Account endgültig löschen" });
    await expect(submitBtn).toBeDisabled();

    // Partial input — still disabled
    await page.locator('input#delete-confirm').fill("LÖSCH");
    await expect(submitBtn).toBeDisabled();

    // Exact match — enabled
    await page.locator('input#delete-confirm').fill("LÖSCHEN");
    await expect(submitBtn).toBeEnabled();
  });

  test("AC-17: Abbrechen schließt Dialog und setzt Eingabe zurück", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await triggerSelector(page).click();
    await page.locator('input#delete-confirm').fill("LÖSCHEN");
    await page.getByRole("button", { name: "Abbrechen" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Re-open: input should be cleared
    await triggerSelector(page).click();
    await expect(page.locator('input#delete-confirm')).toHaveValue("");
  });

  test("AC-18: Sole-Owner-Check — Nutzer mit eigenem Projekt sieht Fehlermeldung beim Löschen", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await triggerSelector(page).click();
    await page.locator('input#delete-confirm').fill("LÖSCHEN");
    await page.getByRole("button", { name: "Account endgültig löschen" }).click();

    // QA user is sole projektleiter on QA-Testprojekt → should see sole-owner error
    await expect(page.getByText(/einzige Projektleiter/)).toBeVisible();
    // NOTE: Button remains enabled after sole-owner error (UX bug BUG-1, Medium)
    // Deletion is still blocked server-side on every retry.
  });
});

// ─── Middleware & Sicherheit ───────────────────────────────────────────────────

test.describe("PROJ-3 — Middleware & Sicherheit (unauthenticated)", () => {
  // These tests intentionally clear storageState to run unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC-19: Unauthentifizierter Nutzer wird von /persoenlicher-bereich zu /anmelden umgeleitet", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await expect(page).toHaveURL(/\/anmelden/);
  });
});

// ─── Responsivität ────────────────────────────────────────────────────────────

test.describe("PROJ-3 — Responsive (Mobile 375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("AC-20: Seite lädt auf 375px ohne Layout-Bruch", async ({ page }) => {
    await page.goto("/persoenlicher-bereich");
    await expect(page.getByRole("heading", { name: "Persönlicher Bereich", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account Übersicht", level: 2 })).toBeVisible();
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px tolerance
  });
});
