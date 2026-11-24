import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { QA_PROJECT_ID, deleteQaChapters } from "./helpers/qa-project";
import { waitForEditorReady } from "./helpers/editor-audit";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { waitForPage } from "./helpers/page-ready";

// PROJ-5 — Bild-Upload im Kapitel-Editor.
//
// Regression (2026-11-20): Bilder über 1 MB scheiterten, weil der Upload als
// Server Action lief (Next.js-Grenze 1 MB, Vercel 4,5 MB). Ein großes,
// nicht komprimierbares Foto (Rauschen, ~5 MB) muss jetzt durchgehen.

const STORAGE_STATE = "tests/.auth/user.json";
const PROJECT_URL = `/projektuebersicht/${QA_PROJECT_ID}`;
const CHAPTER_TITLE = "PROJ-5 Bild-Upload-Testkapitel";

let context: BrowserContext;
let page: Page;
const dir = path.join(tmpdir(), "narravit-e2e-bilder");
const bigImage = path.join(dir, "gross.jpg");

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  if (!existsSync(bigImage)) {
    mkdirSync(dir, { recursive: true });
    const w = 3000;
    const h = 2000;
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 255) | 0;
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toFile(bigImage);
  }
  context = await browser.newContext({ storageState: STORAGE_STATE, viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await deleteQaChapters(page, CHAPTER_TITLE);
  await page.goto(PROJECT_URL);
  await waitForPage(page);
  await page.locator("button", { hasText: "Eigenes Kapitel" }).first().click();
  await page.getByPlaceholder("z. B. Reisen und Begegnungen").fill(CHAPTER_TITLE);
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await page.waitForURL(/kapiteleditor/, { timeout: 15_000 });
  await waitForEditorReady(page);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (page) await deleteQaChapters(page, CHAPTER_TITLE);
  await context?.close();
});

test("AC-Img-1: ein großes Foto (~5 MB) lässt sich hochladen und bleibt nach dem Neuladen", async () => {
  test.setTimeout(90_000);
  await page.getByRole("button", { name: "Bildabschnitt einfügen" }).click();
  await page.locator('input[type="file"]').setInputFiles(bigImage);
  await page.getByRole("button", { name: "Übernehmen" }).click();

  const uploaded = page.locator('img[src*="chapter-heroes"]');
  await expect(uploaded.first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Upload fehlgeschlagen|Bild-Upload fehlgeschlagen/)).toHaveCount(0);

  // Das Bild wird per Auto-Save (2 s Verzögerung) dem Kapitel zugeordnet.
  // Erst danach darf neu geladen werden, sonst testet der Lauf einen Abbruch.
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await waitForEditorReady(page);
  await expect(page.locator('img[src*="chapter-heroes"]').first()).toBeVisible({ timeout: 20_000 });
});
