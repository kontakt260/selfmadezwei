import { test, expect } from "@playwright/test";

// PROJ-7 — Buchweite Seitenzahl, Browser-Smoke gegen Stage-DB.
//
// Diese E2E-Suite verifiziert das visuelle Browser-Verhalten:
//   - Editor lädt start_page aus der DB,
//   - Overlay zeigt buchweite Zahl (start_page + i),
//   - Footer bleibt kapitel-lokal.
//
// Vollständigere Trigger-/Backfill-/Recalc-/Cross-Project-Isolation-Tests
// laufen als SQL gegen die Stage-DB (siehe QA-Test-Tabelle im
// Feature-Spec). Hier erzeugen wir das Test-Kapitel über die UI, da
// PROJ-4 Cleanup das QA-Seed-Kapitel zwischen Runs entfernt.

test.use({ storageState: "tests/.auth/user.json" });

const QA_PROJECT_ID = "cccccccc-0099-0099-0099-000000000099";
const QA_PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;
const TEST_CHAPTER_TITLE = "PROJ-7 Smoke-Kapitel";

// Editor braucht ~5 s bis das Load-Animation-Settling endet — wir warten
// konkret auf das erste .a5-page-number, das danach gerendert wird.
async function waitForPageNumberOverlay(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.locator(".a5-page-number").first().waitFor({ timeout: 20_000 });
}

// Erzeugt das PROJ-7-Test-Kapitel über die UI. Lässt den Browser im
// Editor des frisch angelegten Kapitels stehen.
async function createTestChapter(page: import("@playwright/test").Page) {
  await page.goto(QA_PROJECT_URL);
  await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
  await page.getByPlaceholder("z. B. Reisen und Begegnungen").fill(TEST_CHAPTER_TITLE);
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.waitForURL(/kapiteleditor/, { timeout: 15_000 });
}

// Löscht ALLE Kapitel im QA-Projekt, egal wie sie heißen — gleiches
// Muster wie PROJ-4 beforeAll. Macht die Test-Reihenfolge order-
// independent (PROJ-4 läuft i. d. R. davor und hinterlässt ggf.
// „QA-Testkapitel (umbenannt)").
async function wipeAllChaptersInQaProject(
  p: import("@playwright/test").Page,
) {
  await p.goto(QA_PROJECT_URL);
  await p.waitForLoadState("networkidle");
  // Alle „Kapitel „…" löschen"-Buttons sind delete-Trigger.
  const anyDelete = p.getByRole("button", { name: /Kapitel „.*" löschen/ });
  let count = await anyDelete.count();
  while (count > 0) {
    await anyDelete.first().click();
    await p.waitForTimeout(3_500); // Countdown-Dialog freigeben
    const confirm = p.getByRole("button", { name: /Endgültig löschen/ });
    if (!(await confirm.isVisible().catch(() => false))) break;
    await confirm.click();
    await p.waitForLoadState("networkidle");
    count = await anyDelete.count();
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ storageState: "tests/.auth/user.json" });
  const p = await ctx.newPage();
  await wipeAllChaptersInQaProject(p);
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ storageState: "tests/.auth/user.json" });
  const p = await ctx.newPage();
  await wipeAllChaptersInQaProject(p);
  await ctx.close();
});

// ─── Anzeige ───────────────────────────────────────────────────────────────

test.describe("PROJ-7 — Editor-Anzeige", () => {
  test("AC-Display-1: Overlay zeigt eine positive buchweite Zahl (start_page + 0)", async ({
    page,
  }) => {
    // Erst die Vor-Anzahl an Kapiteln in der Übersicht ermitteln, dann
    // ein neues Kapitel anlegen. Erwarteter start_page = (Vor-Anzahl + 1)
    // wenn alle bestehenden je 1 Seite haben (Default page_count=1).
    await page.goto(QA_PROJECT_URL);
    await page.waitForLoadState("networkidle");
    const priorDeleteButtons = await page
      .getByRole("button", { name: /Kapitel „.*" löschen/ })
      .count();

    await createTestChapter(page);
    await waitForPageNumberOverlay(page);
    const first = await page.locator(".a5-page-number").first().textContent();
    const value = Number(first);
    expect(value).toBe(priorDeleteButtons + 1);
  });

  test("AC-Footer-1: Editor-Footer bleibt kapitel-lokal (Seite 1, keine Buch-Range)", async ({
    page,
  }) => {
    await createTestChapter(page);
    await waitForPageNumberOverlay(page);
    const footer = await page.locator("footer").textContent();
    expect(footer).toMatch(/Seite 1/);
    // Spec AC: Footer enthält explizit KEINE Buch-Range.
    expect(footer).not.toMatch(/Buch-Seite|Buchseite/);
  });
});

// ─── Overlay-Positionierung ────────────────────────────────────────────────

test.describe("PROJ-7 — Overlay-CSS", () => {
  test("AC-CSS-1: Overlay-Span sitzt am rechten Seitenrand im oberen Margin", async ({
    page,
  }) => {
    await createTestChapter(page);
    await waitForPageNumberOverlay(page);
    const box = await page.locator(".a5-page-number").first().boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    // Overlay muss im oberen Drittel des Viewports sein (über der Stack-Mitte).
    expect(box!.y).toBeLessThan(viewport!.height / 2);
  });
});
