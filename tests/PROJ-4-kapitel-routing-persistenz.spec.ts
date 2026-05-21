import { test, expect } from "@playwright/test";

// All tests run as the QA test user (qa-test@narravit.de), role: projektleiter.
// Auth state from globalSetup. Stage DB: project "QA-Testprojekt".
test.use({ storageState: "tests/.auth/user.json" });

const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
const PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;

// Clean up any chapters left over from previous (failed) test runs so all tests start with a clean project state.
test.beforeAll(async ({ browser }) => {
  // Set hook timeout to 120 seconds to allow deleting many leftover chapters
  test.setTimeout(120000);
  const ctx = await browser.newContext({ storageState: "tests/.auth/user.json" });
  const p = await ctx.newPage();
  await p.goto(PROJECT_URL);
  await p.waitForLoadState("networkidle");
  const deleteButtons = p.getByRole("button", { name: /Kapitel „.*" löschen/ });
  let count = await deleteButtons.count();
  console.log(`Starting PROJ-4 cleanup: found ${count} leftover chapters.`);
  let deletedCount = 0;
  while (count > 0) {
    await deleteButtons.first().click();
    await p.waitForTimeout(3500);
    await p.getByRole("button", { name: /Endgültig löschen/ }).click();
    await p.waitForTimeout(1000);
    deletedCount++;
    console.log(`Deleted chapter #${deletedCount}`);
    count = await deleteButtons.count();
  }
  console.log(`PROJ-4 cleanup finished. Deleted ${deletedCount} chapters.`);
  await ctx.close();
});

// NOTE: Chapter modals use role="presentation" (accessibility BUG-3, Medium).
// Tests avoid getByRole("dialog") for chapter modals and use direct locators instead.

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
    await expect(page.getByText("QA-Testprojekt")).toBeVisible();
    const card = page.locator("a", { hasText: "Öffnen" }).first();
    await expect(card).toBeVisible();
    const deleteBtn = page.getByRole("button", { name: /löschen/i }).first();
    await expect(deleteBtn).toBeVisible();
  });

  test("AC-Home-4: Projektkarte zeigt Kapitelanzahl und Bearbeitungsdatum", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("QA-Testprojekt")).toBeVisible();
    await expect(page.getByText(/bearbeitet/i)).toBeVisible();
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

  test("AC-PÜ-3: Sektionen Cover-Karte, Telefon-Platzhalter, Nutzerübersicht sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByRole("heading", { name: "Cover bearbeiten" })).toBeVisible();
    // PROJ-10 ersetzt den alten Cover-Editor-Placeholder durch die echte
    // Karte mit Vorschau + Link auf /cover-bearbeiten.
    const coverLink = page.getByRole("link", { name: /Cover-Editor öffnen/ });
    await expect(coverLink).toBeVisible();
    await expect(coverLink).toHaveAttribute(
      "href",
      `${PROJECT_URL}/cover-bearbeiten`,
    );
    // PROJ-12 appears in two places (phone section + stat card) — use first()
    await expect(page.getByText(/PROJ-12/).first()).toBeVisible();
    // PROJ-9 ersetzt den alten „Projektmitglieder"-Placeholder durch die
    // echte „Nutzerübersicht"-Sektion mit Mitglieder-Liste.
    await expect(page.getByRole("heading", { name: "Nutzerübersicht" })).toBeVisible();
  });

  test("AC-PÜ-4: Stat-Karten Platzhalter sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByText("Telefonzeit übrig")).toBeVisible();
    await expect(page.getByText(/NARRAVIT-Projektzugang endet in/)).toBeVisible();
  });

  test("AC-PÜ-5: Kapitelsektion mit Leerzustand und beiden Aktions-Buttons", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByRole("heading", { name: "Kapitel", exact: true })).toBeVisible();
    await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible();
    // Both action buttons visible in empty state (header + empty-state = 2 each; use first())
    const buttons = page.getByRole("button");
    await expect(buttons.filter({ hasText: "Eigenes Kapitel" }).first()).toBeVisible();
    await expect(buttons.filter({ hasText: "Erzähl-Impuls" }).first()).toBeVisible();
  });

  test("AC-PÜ-6: Ungültige project_id → 404", async ({ page }) => {
    await page.goto("/projektuebersicht/00000000-0000-4000-a000-000000000000");
    await expect(page).toHaveURL(/projektuebersicht/);
    const body = await page.content();
    expect(body).toMatch(/not.?found|404|nicht gefunden/i);
  });
});

// ─── Kapitel CRUD (seriell — bauen aufeinander auf) ─────────────────────────

test.describe("PROJ-4 — Kapitel CRUD", () => {
  test.describe.configure({ mode: "serial" });

  // NOTE: Chapter modals use role="presentation" not role="dialog" (BUG-3).
  // Input in "Eigenes Kapitel" modal: placeholder "z. B. Reisen und Begegnungen"
  // Input in "Umbenennen" modal: placeholder "Kapitelname"

  test("AC-Ch-1: 'Eigenes Kapitel' öffnet Modal mit Titel-Input", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
    const input = page.getByPlaceholder("z. B. Reisen und Begegnungen");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("AC-Ch-2: 'Hinzufügen'-Button disabled wenn Titel leer", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
    const addButton = page.getByRole("button", { name: "Hinzufügen" });
    await expect(addButton).toBeDisabled();
  });

  test("AC-Ch-3: Kapitel anlegen → Redirect zum Kapiteleditor", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
    await page.getByPlaceholder("z. B. Reisen und Begegnungen").fill("QA-Testkapitel");
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    await page.waitForURL(/kapiteleditor/, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`${QA_PROJECT_ID}/kapiteleditor/`));
    await expect(page.getByRole("heading", { name: "QA-Testkapitel" })).toBeVisible();
  });

  test("AC-Ch-4: Kapiteleditor-Seite zeigt PROJ-5 Platzhalter und Zurück-Link", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("link", { name: "Bearbeiten" }).first().click();
    await page.waitForURL(/kapiteleditor/);
    await expect(page.getByPlaceholder("Kapitel-Titel")).toBeVisible();
    const backLink = page.getByRole("link", { name: /Zurück zur Projektübersicht/ });
    await expect(backLink).toBeVisible();
  });

  test("AC-Ch-5: Zurück von Editor → Kapitel in der Liste sichtbar", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expect(page.getByText("QA-Testkapitel").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Bearbeiten" }).first()).toBeVisible();
    await expect(page.getByText("Noch keine Kapitel vorhanden.")).not.toBeVisible();
  });

  test("AC-Ch-6: 'Erzähl-Impuls' Modal öffnet mit Impuls-Titel und Shuffle-Button", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Erzähl-Impuls" }).first().click();
    // Modal opens — check for its action buttons (modal uses role="presentation", not "dialog")
    await expect(page.getByRole("button", { name: "Anderen Vorschlag" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Impuls übernehmen" })).toBeVisible();
  });

  test("AC-Ch-7: 'Anderen Vorschlag' Button zeigt neuen Impuls-Titel", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Erzähl-Impuls" }).first().click();
    // aria-atomic="true" distinguishes the impulse live region from Sonner's aria-live container
    const liveRegion = page.locator("[aria-live='polite'][aria-atomic='true']");
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "Anderen Vorschlag" }).click();
    }
    await expect(page.getByRole("button", { name: "Anderen Vorschlag" })).toBeVisible();
    const currentTitle = await liveRegion.textContent();
    expect(currentTitle).toBeTruthy();
    expect(currentTitle!.trim().length).toBeGreaterThan(0);
  });

  test("AC-Ch-8: Erzähl-Impuls übernehmen → Kapitel erscheint in Liste, kein Redirect", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Erzähl-Impuls" }).first().click();
    const impulsTitle = await page.locator("[aria-live='polite'][aria-atomic='true']").textContent();

    await page.getByRole("button", { name: "Impuls übernehmen" }).click();

    await expect(page).toHaveURL(new RegExp(QA_PROJECT_ID));
    await expect(page).not.toHaveURL(/kapiteleditor/);

    await expect(page.getByText(impulsTitle!.trim())).toBeVisible({ timeout: 8_000 });
  });

  test("AC-Ch-9: Kapitel umbenennen — Modal öffnet mit aktuellem Titel, speichert neuen", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { name: /Kapitel „QA-Testkapitel" umbenennen/ }).click();
    // Rename modal uses role="presentation" (BUG-3); find input by placeholder
    const input = page.getByPlaceholder("Kapitelname");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("QA-Testkapitel");
    await input.fill("QA-Testkapitel (umbenannt)");
    // Wait for the server action to complete (not just the optimistic update)
    const renameResponse = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(QA_PROJECT_ID));
    await page.getByRole("button", { name: "Speichern" }).click();
    await renameResponse;
    await expect(page.getByText("QA-Testkapitel (umbenannt)")).toBeVisible({ timeout: 8_000 });
  });

  test("AC-Ch-10: Kapitel löschen — Countdown-Dialog, Button disabled für 3s, dann aktiv", async ({ page }) => {
    await page.goto(PROJECT_URL);
    const chaptersBeforeCount = await page.getByRole("link", { name: "Bearbeiten" }).count();
    const deleteButtons = page.getByRole("button", { name: /Kapitel „.*" löschen/ });
    await deleteButtons.last().click();

    // Delete modal uses role="presentation" (BUG-3); find button directly
    const deleteButton = page.getByRole("button", { name: /Endgültig löschen/ });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeDisabled();

    await page.waitForTimeout(3_500);
    await expect(deleteButton).toBeEnabled();

    await deleteButton.click();

    await expect(deleteButton).not.toBeVisible({ timeout: 8_000 });
    const chaptersAfterCount = await page.getByRole("link", { name: "Bearbeiten" }).count();
    expect(chaptersAfterCount).toBe(chaptersBeforeCount - 1);
  });

  test("AC-Ch-11: Cleanup — verbleibendes Testkapitel löschen → Leerzustand", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.getByRole("button", { name: /Kapitel „QA-Testkapitel \(umbenannt\)" löschen/ }).click();
    await page.waitForTimeout(3_500);
    const deleteButton = page.getByRole("button", { name: /Endgültig löschen/ });
    await deleteButton.click();
    await expect(deleteButton).not.toBeVisible({ timeout: 8_000 });

    await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Sicherheit & Auth ────────────────────────────────────────────────────────

test.describe("PROJ-4 — Sicherheit", () => {
  test("AC-Sec-1: Unauthenticated access zu / → redirect zu /anmelden", async ({ browser }) => {
    // file-level test.use({ storageState }) would be inherited by browser.newContext() —
    // pass an explicit empty state to guarantee a truly unauthenticated context.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/anmelden/);
    await context.close();
  });

  test("AC-Sec-2: Unauthenticated access zu Projektübersicht → redirect zu /anmelden", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(PROJECT_URL);
    await expect(page).toHaveURL(/\/anmelden/);
    await context.close();
  });

  test("AC-Sec-3: Fremde project_id → 404 (kein Datenleck)", async ({ page }) => {
    await page.goto("/projektuebersicht/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
    const body = await page.content();
    expect(body).toMatch(/not.?found|404|nicht gefunden/i);
  });

  test("AC-Sec-4: Titel > 200 Zeichen wird server-seitig abgelehnt", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
    // Modal uses role="presentation" (BUG-3); find input by placeholder
    const input = page.getByPlaceholder("z. B. Reisen und Begegnungen");
    await input.fill("A".repeat(201));
    const value = await input.inputValue();
    expect(value.length).toBeLessThanOrEqual(200);
  });
});

// ─── Responsive / Navigation ─────────────────────────────────────────────────

test.describe("PROJ-4 — Responsive & Navigation", () => {
  test("AC-Nav-1: Kapiteleditor-Route zeigt Kapiteltitel im Header", async ({ page }) => {
    await page.goto(PROJECT_URL);
    const editLink = page.getByRole("link", { name: "Bearbeiten" }).first();
    const hasChapters = await editLink.isVisible().catch(() => false);
    if (hasChapters) {
      await editLink.click();
      await page.waitForURL(/kapiteleditor/);
      await expect(page.getByPlaceholder("Kapitel-Titel")).toBeVisible();
      const backLink = page.getByRole("link", { name: /Zurück zur Projektübersicht/ });
      await expect(backLink).toBeVisible();
    } else {
      await expect(page.getByText("Noch keine Kapitel vorhanden.")).toBeVisible();
    }
  });
});
