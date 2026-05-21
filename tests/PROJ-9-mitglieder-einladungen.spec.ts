import { test, expect } from "@playwright/test";

// PROJ-9 — Mitgliederverwaltung Browser-Smoke gegen Stage-DB.
//
// Diese E2E-Suite verifiziert:
//   - Mitgliederliste rendert mit dem eigenen Member-Eintrag.
//   - PL sieht „Nutzer hinzufügen"-Button + Verwaltungs-Controls.
//   - Last-PL-Disable greift (Trash + Toggle + Projekt-verlassen).
//   - AddUser-Modal Step 1 → Step 2 mit Link-Anzeige.
//   - /einladung/[token]-Page mit ungültigem Token → klare Fehlermeldung.
//
// Vollständigere RLS-/Trigger-Tests laufen als SQL gegen die Stage-DB
// (siehe QA-Sektion im Feature-Spec).

test.use({ storageState: "tests/.auth/user.json" });

const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
const QA_PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;

// ─── Mitgliederliste — Anzeige + PL-Controls ───────────────────────────────

test.describe("PROJ-9 — Mitgliederliste", () => {
  test("AC-List-1: Nutzerübersicht-Sektion sichtbar mit eigenem Eintrag", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(
      page.getByRole("heading", { name: "Nutzerübersicht" }),
    ).toBeVisible();
    await expect(page.getByText("qa-test@narravit.de").first()).toBeVisible();
    await expect(page.getByText("(Du)")).toBeVisible();
  });

  test("AC-List-2: PL sieht 'Nutzer hinzufügen'-Button", async ({ page }) => {
    await page.goto(QA_PROJECT_URL);
    await expect(
      page.getByRole("button", { name: /Nutzer hinzufügen/ }),
    ).toBeVisible();
  });

  test("AC-LastPL-1: Sole-PL Trash-Button ist disabled mit Tooltip", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    const trash = page.getByRole("button", { name: /QA Testkonto.*entfernen/ }).first();
    await expect(trash).toBeVisible();
    await expect(trash).toBeDisabled();
    await expect(trash).toHaveAttribute(
      "title",
      "Mindestens ein Projektleiter muss verbleiben.",
    );
  });

  test("AC-LastPL-2: 'Projekt verlassen' ist disabled für Sole-PL", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    const leave = page.getByRole("button", { name: /Projekt verlassen/ });
    await expect(leave).toBeDisabled();
  });
});

// ─── AddUser-Modal: Step 1 → Step 2 ────────────────────────────────────────

test.describe("PROJ-9 — AddUser-Modal", () => {
  test("AC-Modal-1: Modal öffnet in Step 1 mit Eingabe-Feldern", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await page.getByRole("button", { name: /Nutzer hinzufügen/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
    await expect(page.getByLabel("Rolle")).toBeVisible();
    await expect(page.getByRole("button", { name: /Einladen/ })).toBeDisabled();
  });

  test("AC-Modal-2: Step 2 zeigt Token-Link + Copy-Button nach erfolgreicher Einladung", async ({
    page,
  }) => {
    await page.goto(QA_PROJECT_URL);
    await page.getByRole("button", { name: /Nutzer hinzufügen/ }).click();
    await page.getByLabel("E-Mail-Adresse").fill("proj9-e2e@example.com");
    // Rolle bleibt Default „Co-Autor"
    await page.getByRole("button", { name: /Einladen/ }).click();
    // Step 2 erscheint
    await expect(
      page.getByRole("heading", { name: "Einladung erstellt" }),
    ).toBeVisible({ timeout: 10_000 });
    // Link enthält /einladung/<token> — Host kommt aus NEXT_PUBLIC_SITE_URL
    // (env-abhängig; lokal kann es localhost:3000 oder stage-app.narravit.de sein).
    await expect(page.getByText(/\/einladung\/[A-Za-z0-9_-]+/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Link kopieren/ })).toBeVisible();
    // Cleanup: dialog schließen — den eigentlichen Invitation-Row räumen wir SQL-seitig auf.
    await page.getByRole("button", { name: "Schließen" }).click();
  });
});

// ─── Accept-Page: Token-Varianten ──────────────────────────────────────────

test.describe("PROJ-9 — /einladung/[token]", () => {
  test("AC-Accept-1: Ungültiger Token zeigt 'Einladung nicht gefunden'", async ({
    page,
  }) => {
    await page.goto("/einladung/definitely-not-a-real-token-1234567890abc");
    await expect(
      page.getByRole("heading", { name: "Einladung nicht gefunden" }),
    ).toBeVisible();
  });
});
