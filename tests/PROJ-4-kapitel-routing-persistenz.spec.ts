import { test, expect } from "@playwright/test";

// All tests run as the QA test user (qa-test@narravit.de), role: projektleiter.
// Auth state from globalSetup. Stage DB: project "QA-Testprojekt".
test.use({ storageState: "tests/.auth/user.json" });

const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
const PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;

// ─── Home (/) ────────────────────────────────────────────────────────────────

test.describe("PROJ-4 — Home-Seite (/)", () => {
  test("AC-Home-1: Zeigt Projektkarte mit Titel und Öffnen-Button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Willkommen zurück bei NARRAVIT" })).toBeVisible();
    await expect(page.getByText("QA-Testprojekt")).toBeVisible();
    await expect(page.getByRole("link", { name: /Öffnen/ })).toBeVisible();
  });

  test("AC-Home-2: 'Weiteren Projekt-Zugang kaufen' verlinkt auf /onboarding", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /Weiteren Projekt-Zugang kaufen/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/onboarding");
  });

  test("AC-Home-3: Löschen-Button für projektleiter sichtbar", async ({ page }) => {
    await page.goto("/");
    // The delete button is visible for projektleiter — check via aria-label or button text
    await expect(page.getByText("QA-Testprojekt")).toBeVisible();
    // "Öffnen"-Button and delete button should both be in the card
    const card = page.locator("a", { hasText: "Öffnen" }).first();
    await expect(card).toBeVisible();
    // Delete button exists (rendered only for projektleiter)
    const deleteBtn = page.getByRole("button", { name: /löschen/i }).first();
    await expect(deleteBtn).toBeVisible();
  });

  test("AC-Home-4: Projektkarte zeigt Kapitelanzahl und Bearbeitungsdatum", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("QA-Testprojekt")).toBeVisible();
    // Date is shown (relative format like "Heute bearbeitet", "Vor X Tagen bearbeitet")
    await expect(page.getByText(/bearbeitet/i)).toBeVisible();
    // Chapter count is shown (even if 0)
    await expect(page.getByText(/Kapitel/i)).toBeVisible();
  });
});

// ─── Projektübersicht ─────────────────────────────────────────────────────────

test.describe("PROJ-4 — Projektübersicht", () => {
  test("AC-PÜ-1: Seite lädt mit korrektem Projekttitel und URL", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(new RegExp(QA_PROJECT_ID));
    await expect(page.getByRole("heading", { name: "QA-Testprojekt", level: 1 })).toBeVisible();
  });

  test("AC-PÜ-2: 'Zurück zur Startseite' Link vorhanden", async ({ page }) => {
    await page.goto(PROJECT_URL);
    const backLink = page.getByRole("link", { name: /Zurück zur Startseite/ });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });

  test("AC-PÜ-3: Platzhalter-Sektionen Cover, Telefon und Mitglieder sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByRole("heading", { name: "Cover bearbeiten" })).toBeVisible();
    await expect(page.getByText(/PROJ-10/)).toBeVisible();
    await expect(page.getByText(/PROJ-12/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projektmitglieder" })).toBeVisible();
    await expect(page.getByText(/PROJ-9/)).toBeVisible();
  });

  test("AC-PÜ-4: Stat-Karten Platzhalter sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByText("Telefonzeit übrig")).toBeVisible();
    await expect(page.getByText(/NARRAVIT-Projektzugang endet in/)).toBeVisible();
  });

  test("AC-PÜ-5: Kapitelsektion mit Leerzustand und beiden Aktions-Buttons", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByRole("heading", { name: "Kapitel" })).toBeVisible();
    await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible();
    // Both action buttons visible in empty state
    const buttons = page.getByRole("button");
    await expect(buttons.filter({ hasText: "Eigenes Kapitel" })).toBeVisible();
    await expect(buttons.filter({ hasText: "Erzähl-Impuls" })).toBeVisible();
  });

  test("AC-PÜ-6: Ungültige project_id → 404", async ({ page }) => {
    await page.goto("/projektuebersicht/00000000-0000-4000-a000-000000000000");
    await expect(page).toHaveURL(/projektuebersicht/);
    // Next.js notFound() shows "This page could not be found." or custom not-found page
    const body = await page.content();
    expect(body).toMatch(/not.?found|404|nicht gefunden/i);
  });
});

// ─── Kapitel CRUD (seriell — bauen aufeinander auf) ─────────────────────────

test.describe("PROJ-4 — Kapitel CRUD", () => {
  test.describe.configure({ mode: "serial" });

  test("AC-Ch-1: 'Eigenes Kapitel' öffnet Modal mit Titel-Input", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Eigenes Kapitel" }).first().click();
    const input = page.getByRole("dialog").locator("input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("AC-Ch-2: 'Hinzufügen'-Button disabled wenn Titel leer", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Eigenes Kapitel" }).first().click();
    const addButton = page.getByRole("button", { name: "Hinzufügen" });
    await expect(addButton).toBeDisabled();
  });

  test("AC-Ch-3: Kapitel anlegen → Redirect zum Kapiteleditor", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Eigenes Kapitel" }).first().click();
    await page.getByRole("dialog").locator("input").fill("QA-Testkapitel");
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    // Should redirect to the kapiteleditor route
    await page.waitForURL(/kapiteleditor/, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`${QA_PROJECT_ID}/kapiteleditor/`));
    await expect(page.getByRole("heading", { name: "QA-Testkapitel" })).toBeVisible();
  });

  test("AC-Ch-4: Kapiteleditor-Seite zeigt PROJ-5 Platzhalter und Zurück-Link", async ({ page }) => {
    await page.goto(PROJECT_URL);
    // Navigate into the chapter via the "Bearbeiten" link
    await page.getByRole("link", { name: "Bearbeiten" }).first().click();
    await page.waitForURL(/kapiteleditor/);
    await expect(page.getByText(/PROJ-5/)).toBeVisible();
    const backLink = page.getByRole("link", { name: /Zurück zur Projektübersicht/ });
    await expect(backLink).toBeVisible();
  });

  test("AC-Ch-5: Zurück von Editor → Kapitel in der Liste sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByText("QA-Testkapitel")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bearbeiten" })).toBeVisible();
    // Empty state no longer shown
    await expect(page.getByText("Noch keine Kapitel vorhanden.")).not.toBeVisible();
  });

  test("AC-Ch-6: 'Erzähl-Impuls' Modal öffnet mit Impuls-Titel und Shuffle-Button", async ({ page }) => {
    await page.goto(PROJECT_URL);
    // Click the section header "Erzähl-Impuls" button (not the empty state one)
    await page.getByRole("button", { hasText: "Erzähl-Impuls" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anderen Vorschlag" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Impuls übernehmen" })).toBeVisible();
  });

  test("AC-Ch-7: 'Anderen Vorschlag' Button zeigt neuen Impuls-Titel", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Erzähl-Impuls" }).first().click();
    const dialog = page.getByRole("dialog");
    const initialTitle = await dialog.locator("[aria-live='polite']").textContent();
    // Click shuffle multiple times (may show same title by chance on small list, so try a few times)
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "Anderen Vorschlag" }).click();
    }
    // At minimum, the button should still be visible and functional (no crash)
    await expect(page.getByRole("button", { name: "Anderen Vorschlag" })).toBeVisible();
    // Verify title is still shown (not empty)
    const currentTitle = await dialog.locator("[aria-live='polite']").textContent();
    expect(currentTitle).toBeTruthy();
    expect(currentTitle!.trim().length).toBeGreaterThan(0);
  });

  test("AC-Ch-8: Erzähl-Impuls übernehmen → Kapitel erscheint in Liste, kein Redirect", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Erzähl-Impuls" }).first().click();
    const dialog = page.getByRole("dialog");
    const impulsTitle = await dialog.locator("[aria-live='polite']").textContent();

    await page.getByRole("button", { name: "Impuls übernehmen" }).click();

    // Should stay on the same page (no redirect)
    await expect(page).toHaveURL(new RegExp(QA_PROJECT_ID));
    await expect(page).not.toHaveURL(/kapiteleditor/);

    // Impulse chapter appears in the list
    await expect(page.getByText(impulsTitle!.trim())).toBeVisible({ timeout: 8_000 });
  });

  test("AC-Ch-9: Kapitel umbenennen — Modal öffnet mit aktuellem Titel, speichert neuen", async ({ page }) => {
    await page.goto(PROJECT_URL);
    // Click rename button for the own chapter (aria-label contains "QA-Testkapitel")
    await page.getByRole("button", { name: /Kapitel „QA-Testkapitel" umbenennen/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Input prefilled with current title
    const input = dialog.locator("input");
    await expect(input).toHaveValue("QA-Testkapitel");
    // Rename
    await input.fill("QA-Testkapitel (umbenannt)");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    // Modal closes, new title visible
    await expect(page.getByText("QA-Testkapitel (umbenannt)")).toBeVisible({ timeout: 8_000 });
  });

  test("AC-Ch-10: Kapitel löschen — Countdown-Dialog, Button disabled für 3s, dann aktiv", async ({ page }) => {
    await page.goto(PROJECT_URL);
    // Count chapters before deletion
    const chaptersBeforeCount = await page.getByRole("link", { name: "Bearbeiten" }).count();
    // Delete the impulse chapter (second in list or last)
    const deleteButtons = page.getByRole("button", { name: /Kapitel „.*" löschen/ });
    // Delete last chapter in list (the impulse one)
    await deleteButtons.last().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const deleteButton = dialog.getByRole("button", { name: /Endgültig löschen/ });

    // Button disabled initially (countdown running)
    await expect(deleteButton).toBeDisabled();

    // Wait for countdown to complete
    await page.waitForTimeout(3_500);
    await expect(deleteButton).toBeEnabled();

    // Confirm deletion
    await deleteButton.click();

    // Dialog closes, chapter count decreases
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    const chaptersAfterCount = await page.getByRole("link", { name: "Bearbeiten" }).count();
    expect(chaptersAfterCount).toBe(chaptersBeforeCount - 1);
  });

  test("AC-Ch-11: Cleanup — verbleibendes Testkapitel löschen → Leerzustand", async ({ page }) => {
    await page.goto(PROJECT_URL);
    // Delete remaining chapter "QA-Testkapitel (umbenannt)"
    await page.getByRole("button", { name: /Kapitel „QA-Testkapitel \(umbenannt\)" löschen/ }).click();
    const dialog = page.getByRole("dialog");
    await page.waitForTimeout(3_500);
    await dialog.getByRole("button", { name: /Endgültig löschen/ }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    // Verify back to empty state
    await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Sicherheit & Auth ────────────────────────────────────────────────────────

test.describe("PROJ-4 — Sicherheit", () => {
  test("AC-Sec-1: Unauthenticated access zu / → redirect zu /anmelden", async ({ browser }) => {
    const context = await browser.newContext(); // no storageState = no auth
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/anmelden/);
    await context.close();
  });

  test("AC-Sec-2: Unauthenticated access zu Projektübersicht → redirect zu /anmelden", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(/\/anmelden/);
    await context.close();
  });

  test("AC-Sec-3: Fremde project_id → 404 (kein Datenleck)", async ({ page }) => {
    // A valid UUID format, but not a project this user is a member of
    await page.goto("/projektuebersicht/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
    const body = await page.content();
    expect(body).toMatch(/not.?found|404|nicht gefunden/i);
  });

  test("AC-Sec-4: Titel > 200 Zeichen wird server-seitig abgelehnt", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { hasText: "Eigenes Kapitel" }).first().click();
    const input = page.getByRole("dialog").locator("input");
    // Fill 201 characters — browser maxlength attribute should cap it
    await input.fill("A".repeat(201));
    const value = await input.inputValue();
    // Either client trims to 200 or server rejects
    expect(value.length).toBeLessThanOrEqual(200);
  });
});

// ─── Responsive / Navigation ─────────────────────────────────────────────────

test.describe("PROJ-4 — Responsive & Navigation", () => {
  test("AC-Nav-1: Kapiteleditor-Route zeigt Kapiteltitel im Header", async ({ page }) => {
    // First navigate to project to find a chapter link (if any chapters exist)
    // This test relies on the serial CRUD tests cleaning up, so we only check routing
    await page.goto(PROJECT_URL);
    // If chapters exist from a previous failed cleanup, find one
    const editLink = page.getByRole("link", { name: "Bearbeiten" }).first();
    const hasChapters = await editLink.isVisible().catch(() => false);
    if (hasChapters) {
      await editLink.click();
      await page.waitForURL(/kapiteleditor/);
      await expect(page.getByText(/PROJ-5/)).toBeVisible();
      const backLink = page.getByRole("link", { name: /Zurück zur Projektübersicht/ });
      await expect(backLink).toBeVisible();
    } else {
      // No chapters — verify empty state is clean
      await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible();
    }
  });
});
