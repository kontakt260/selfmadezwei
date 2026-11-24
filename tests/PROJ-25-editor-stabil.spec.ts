import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { layoutFingerprint, solidPng, startMotion, stopMotion, type Motion } from "./helpers/editor-bench";
import { assertStage, createTestAccount, readEnvLocal, signIn, type TestAccount } from "./helpers/stage";

// PROJ-25: Der Editor bleibt ruhig. Eigene temporäre Konten auf Stage.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-25-editor-stabil.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj25-${RUN_ID}.json`);
const REFERENCE_HASH = "bada2a73d24ddeca";
const SENTENCE = "Damals gingen wir jeden Morgen gemeinsam den langen Weg durch das Dorf zur Schule. ";
const LINE = "Wir erzählten uns unterwegs viele Geschichten aus dem Dorf. ";
const TEXT_BLOCKS = ".tiptap-editor > p";

type ChapterKey = "menu" | "writeOn" | "touch" | "tablet" | "grow" | "shrink" | "layout" | "pageBreak" | "idle" | "controls" | "reference" | "typing" | "open";
type SectionImage = { id: string; storage_path: string; signed_url: string; alt: string };

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
const chapters = {} as Record<ChapterKey, string>;

const textDoc = (paragraphs: number, repeat = 5) => ({
  type: "doc",
  content: Array.from({ length: paragraphs }, (_, index) => ({
    type: "paragraph",
    content: [{ type: "text", text: `${index + 1}. ${SENTENCE.repeat(repeat)}` }],
  })),
});

const chapterUrl = (key: ChapterKey) => `/projektuebersicht/${projectId}/kapiteleditor/${chapters[key]}`;

async function openChapter(page: Page, key: ChapterKey) {
  await page.goto(chapterUrl(key));
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.waitForTimeout(600);
}

// PROJ-34: Hinter den Fotos am Kapitelende steht die leere Schreibzeile.
// Getippt wird am Ende des Textes davor, damit die Fotos wirklich wandern.
async function cursorToEnd(page: Page) {
  const last = page.locator(`${TEXT_BLOCKS}:not(.a5-trailing-line)`).last();
  await last.scrollIntoViewIfNeeded();
  const box = (await last.boundingBox())!;
  await last.click({ position: { x: box.width - 2, y: box.height - 6 } });
  await page.waitForTimeout(350);
}

function expectCalm(motion: Motion, label: string) {
  expect(motion.moves, `${label}: Anzahl Bewegungen`).toBeLessThanOrEqual(1);
  expect(motion.returns, `${label}: Rücksprünge`).toBe(0);
  expect(motion.settleMs, `${label}: Zeit bis zur Ruhe`).toBeLessThanOrEqual(150);
}

test.describe("PROJ-25 — Editor bleibt ruhig", () => {
  test.use({ storageState: SESSION_FILE });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const env = readEnvLocal();
    assertStage(env);
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    account = await createTestAccount(admin, { email: `e2e-proj25-${RUN_ID}@example.test`, name: "Test Editor" });
    const { data: project, error } = await admin
      .from("projects")
      .insert({ title: "Editor-Prüfstand", owner_id: account.id })
      .select("id")
      .single();
    if (error || !project) throw new Error(error?.message ?? "Projekt fehlt");
    projectId = project.id as string;
    await admin.from("project_access").insert({ project_id: projectId, expires_at: "2028-06-15T12:00:00Z" });
    await admin.from("project_members").insert({ project_id: projectId, user_id: account.id, role: "projektleiter" });

    const folder = crypto.randomUUID();
    const upload = async (name: string, color: [number, number, number]): Promise<SectionImage> => {
      const storagePath = `${projectId}/${folder}/${name}.png`;
      const { error: uploadError } = await admin.storage
        .from("chapter-heroes")
        .upload(storagePath, solidPng(600, 400, color), { contentType: "image/png" });
      if (uploadError) throw new Error(uploadError.message);
      return { id: crypto.randomUUID(), storage_path: storagePath, signed_url: "", alt: name };
    };
    const [a, b, c, d] = [
      await upload("start-a", [150, 184, 151]),
      await upload("start-b", [208, 188, 166]),
      await upload("end-a", [74, 69, 63]),
      await upload("end-b", [224, 220, 213]),
    ];
    const fresh = (image: SectionImage) => ({ ...image, id: crypto.randomUUID() });
    const none = { layout: "1-spaltig", images: [] as SectionImage[] };
    const endImages = { start: none, end: { layout: "1-spaltig", images: [a, b, c, d].map(fresh) } };
    const rows: Array<[ChapterKey, unknown, unknown]> = [
      ["menu", textDoc(30), { start: none, end: none }],
      ["writeOn", textDoc(24), { start: none, end: none }],
      ["touch", textDoc(30), { start: none, end: none }],
      ["tablet", textDoc(9), endImages],
      ["grow", textDoc(8), endImages],
      ["shrink", textDoc(9), endImages],
      ["layout", textDoc(8), endImages],
      ["pageBreak", textDoc(12), endImages],
      ["idle", textDoc(12), { start: { layout: "1-spaltig", images: [a, b].map(fresh) }, end: { layout: "1-spaltig", images: [c, d].map(fresh) } }],
      ["controls", textDoc(3), endImages],
      ["reference", textDoc(105, 6), { start: { layout: "1-spaltig", images: [a, b].map(fresh) }, end: { layout: "2-spaltig", images: [c, d].map(fresh) } }],
      ["typing", textDoc(105), { start: { layout: "1-spaltig", images: [a, b].map(fresh) }, end: { layout: "1-spaltig", images: [c, d].map(fresh) } }],
      ["open", textDoc(24), endImages],
    ];
    const inserts = rows.map(([key, body, sections], index) => {
      chapters[key] = crypto.randomUUID();
      return {
        id: chapters[key],
        project_id: projectId,
        title: `Kapitel ${key}`,
        sort_order: index,
        chapter_origin: "custom",
        body,
        word_count: 100,
        page_count: 1,
        image_sections: sections,
      };
    });
    const { error: chapterError } = await admin.from("chapters").insert(inserts as never, { defaultToNull: false });
    if (chapterError) throw new Error(chapterError.message);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await signIn(await context.newPage(), account);
    await context.storageState({ path: SESSION_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    fs.rmSync(SESSION_FILE, { force: true });
    if (!admin) return;
    if (projectId) {
      const { data: folders } = await admin.storage.from("chapter-heroes").list(projectId);
      for (const folder of folders ?? []) {
        const { data: files } = await admin.storage.from("chapter-heroes").list(`${projectId}/${folder.name}`);
        if (files?.length) {
          await admin.storage.from("chapter-heroes").remove(files.map((file) => `${projectId}/${folder.name}/${file.name}`));
        }
      }
      await admin.from("mail_log").delete().eq("project_id", projectId);
      await admin.from("projects").delete().eq("id", projectId);
      await admin.from("trash_chapters").delete().eq("project_id", projectId);
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
    }
    if (account) await admin.auth.admin.deleteUser(account.id);
  });

  test("AC-1 bis AC-4: Zeilenabstand funktioniert weit unten im Kapitel", async ({ page }) => {
    await openChapter(page, "menu");
    const target = page.locator(TEXT_BLOCKS).nth(14);
    await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + 60, box.y + 12);
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(1_000);

    const trigger = page.getByLabel("Zeilenabstand");
    await trigger.click();
    const option = page.getByRole("option", { name: "2,0" });
    await expect(option).toBeInViewport({ ratio: 1, timeout: 2_000 });
    const opened = await page.evaluate(() => ({
      bar: document.querySelector(".editor-chrome")!.getBoundingClientRect().top,
      trigger: document.querySelector("[aria-label='Zeilenabstand']")!.getBoundingClientRect().bottom,
      menu: document.querySelector("[role='listbox']")!.getBoundingClientRect().top,
      scroll: window.scrollY,
    }));
    expect(opened.bar).toBe(0);
    expect(opened.menu).toBeGreaterThanOrEqual(opened.trigger);
    expect(opened.menu - opened.trigger).toBeLessThan(16);
    expect(opened.scroll).toBe(before);

    await option.click();
    await expect(target).toHaveAttribute("data-line-height", "2");
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({
      bar: document.querySelector(".editor-chrome")!.getBoundingClientRect().top,
      scroll: window.scrollY,
    }));
    expect(after.bar).toBe(0);
    expect(Math.abs(after.scroll - before)).toBeLessThanOrEqual(120);
  });

  test("AC-4: Nach dem Zeilenabstand geht das Schreiben an der Cursorstelle weiter", async ({ page }) => {
    await openChapter(page, "writeOn");
    const target = page.locator(TEXT_BLOCKS).nth(10);
    await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(250);
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + 80, box.y + 12);
    const trigger = page.getByLabel("Zeilenabstand");

    // Mit der Maus
    await trigger.click();
    await page.getByRole("option", { name: "2,0" }).click();
    await expect(target).toHaveAttribute("data-line-height", "2");
    await expect(page.locator(".tiptap-editor")).toBeFocused();
    await page.keyboard.type("MAUS");
    await expect(target).toContainText("MAUS");

    // Derselbe Wert noch einmal
    await trigger.click();
    await page.getByRole("option", { name: "2,0" }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.locator(".tiptap-editor")).toBeFocused();
    await page.keyboard.type("GLEICH");
    await expect(target).toContainText("GLEICH");

    // Mit der Tastatur
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "2,0" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("option", { name: "1,5" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(target).not.toHaveAttribute("data-line-height", "2");
    await expect(page.locator(".tiptap-editor")).toBeFocused();
    await page.keyboard.type("TASTE");
    await expect(target).toContainText("TASTE");

    // Escape bricht ab: Der Fokus bleibt für Tastaturnutzer auf dem Schalter.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Mit der Maus geöffnet und mit Escape abgebrochen: weiter im Text.
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.locator(".tiptap-editor")).toBeFocused();
    await page.keyboard.type("ABBRUCH");
    await expect(target).toContainText("ABBRUCH");
  });

  test("AC-5: Zeilenabstand mit Tastatur und Touch", async ({ page, browser }) => {
    await openChapter(page, "menu");
    await page.evaluate(() => window.scrollTo(0, 1_400));
    await page.getByLabel("Zeilenabstand").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "1,0" })).toBeInViewport({ timeout: 2_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);

    const context = await browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
    });
    try {
      const tablet = await context.newPage();
      await openChapter(tablet, "touch");
      const target = tablet.locator(TEXT_BLOCKS).nth(12);
      await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await tablet.waitForTimeout(300);
      await target.tap({ position: { x: 40, y: 10 } });
      await tablet.getByLabel("Zeilenabstand").tap();
      const option = tablet.getByRole("option", { name: "2,0" });
      await expect(option).toBeInViewport({ timeout: 2_000 });
      await option.tap();
      await expect(target).toHaveAttribute("data-line-height", "2");
    } finally {
      await context.close();
    }
  });

  test("AC-7 bis AC-9: Bilder bewegen sich beim Tippen höchstens einmal", async ({ page }) => {
    await openChapter(page, "grow");
    await cursorToEnd(page);
    const steps: Motion[] = [];
    for (let i = 0; i < 24; i += 1) {
      await startMotion(page);
      await page.keyboard.insertText(LINE);
      await page.waitForTimeout(420);
      steps.push(await stopMotion(page));
    }
    expect(steps.filter((step) => step.moves > 0).length, "Die Bilder wandern im Test wirklich").toBeGreaterThan(0);
    steps.forEach((step, index) => expectCalm(step, `Eingabe ${index + 1}`));
  });

  test("AC-7 bis AC-9: Bilder bewegen sich beim Löschen höchstens einmal", async ({ page }) => {
    await openChapter(page, "shrink");
    await cursorToEnd(page);
    const steps: Motion[] = [];
    for (let i = 0; i < 24; i += 1) {
      await startMotion(page);
      // Eine einzige Eingabe: eine markierte Zeile wird gelöscht.
      await page.keyboard.press("Shift+ArrowUp");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(420);
      steps.push(await stopMotion(page));
    }
    expect(steps.filter((step) => step.moves > 0).length).toBeGreaterThan(0);
    steps.forEach((step, index) => expectCalm(step, `Löschen ${index + 1}`));
  });

  test("AC-7 bis AC-9: Layoutwechsel bewegt die Bilder einmal", async ({ page }) => {
    await openChapter(page, "layout");
    for (const name of ["2 Bilder nebeneinander", "1 Bild pro Zeile", "2 Bilder nebeneinander", "1 Bild pro Zeile"]) {
      const section = page.locator("[data-image-section-wrapper]").last();
      await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await section.hover();
      const toggle = section.getByLabel(name);
      await expect(toggle).toBeVisible();
      await startMotion(page);
      await toggle.click();
      await page.waitForTimeout(700);
      expectCalm(await stopMotion(page), name);
    }
  });

  test("AC-10: Manueller Seitenumbruch bewegt den Text nur einmal", async ({ page }) => {
    await openChapter(page, "pageBreak");
    const target = page.locator(TEXT_BLOCKS).nth(3);
    await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + 60, box.y + 12);
    await page.waitForTimeout(300);
    await startMotion(page, TEXT_BLOCKS);
    await page.getByRole("button", { name: /Seitenumbruch/ }).click();
    await page.waitForTimeout(800);
    expectCalm(await stopMotion(page), "Seitenumbruch");
  });

  test("AC-11: Ohne Eingabe bleibt die Seite völlig ruhig", async ({ page }) => {
    await openChapter(page, "idle");
    await startMotion(page, `${TEXT_BLOCKS}, [data-paginate-row] img`);
    await page.waitForTimeout(5_500);
    const motion = await stopMotion(page);
    expect(motion.moves).toBe(0);
  });

  test("AC-12: Die Bild-Steuerung verdeckt keinen Text", async ({ page }) => {
    await openChapter(page, "controls");
    const section = page.locator("[data-image-section-wrapper]").last();
    // Die Steuerung sitzt auf der ersten Bildreihe, der Abschnitt kann länger sein.
    const firstRow = section.locator("[data-paginate-row]").first();
    await firstRow.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await firstRow.hover();
    const toggle = section.getByLabel("2 Bilder nebeneinander");
    await expect(toggle).toBeVisible();
    await page.waitForTimeout(250);
    // Auch die Symbole zum Verschieben und Löschen bleiben frei.
    await section.getByLabel("2 Bilder nebeneinander").click();
    await page.waitForTimeout(350);
    await section.locator("img").first().hover();
    await page.waitForTimeout(250);
    const iconsFree = await section.evaluate((wrapper) => {
      const control = wrapper.querySelector("[aria-label='1 Bild pro Zeile']")!.parentElement!.parentElement!.getBoundingClientRect();
      return Array.from(wrapper.querySelectorAll("[aria-label='Bild löschen'], [aria-label='Bild verschieben']")).every((icon) => {
        const box = icon.getBoundingClientRect();
        return box.bottom <= control.top || box.top >= control.bottom || box.right <= control.left || box.left >= control.right;
      });
    });
    expect(iconsFree).toBe(true);
    const overlap = await page.evaluate(() => {
      const wrappers = document.querySelectorAll("[data-image-section-wrapper]");
      const control = wrappers[wrappers.length - 1]
        .querySelector("[aria-label='2 Bilder nebeneinander']")!
        .parentElement!.parentElement!.getBoundingClientRect();
      const blocks = Array.from(document.querySelectorAll(".tiptap-editor > p"));
      const range = document.createRange();
      range.selectNodeContents(blocks[blocks.length - 1]);
      return Array.from(range.getClientRects()).some(
        (line) => line.bottom > control.top && line.top < control.bottom && line.right > control.left && line.left < control.right,
      );
    });
    expect(overlap).toBe(false);
  });

  for (const [label, viewport] of [
    ["Hochformat", { width: 768, height: 1024 }],
    ["Querformat", { width: 1024, height: 768 }],
  ] as const) {
    test(`AC-12, AC-19: Tablet im ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: SESSION_FILE, viewport, hasTouch: true });
      try {
        const tablet = await context.newPage();
        await openChapter(tablet, "tablet");
        const section = tablet.locator("[data-image-section-wrapper]").last();
        await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await section.locator("img").first().tap();
        const toggle = section.getByLabel("2 Bilder nebeneinander");
        await expect(toggle).toBeVisible();
        await expect.poll(() => toggle.evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).opacity)).toBe("1");
        await startMotion(tablet);
        await toggle.tap();
        await tablet.waitForTimeout(600);
        expectCalm(await stopMotion(tablet), "Layoutwechsel auf dem Tablet");
        await section.locator("img").first().tap();
        const back = section.getByLabel("1 Bild pro Zeile");
        await expect.poll(() => back.evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).opacity)).toBe("1");
        await back.tap();

        const target = tablet.locator(TEXT_BLOCKS).last();
        await target.scrollIntoViewIfNeeded();
        await target.tap({ position: { x: 40, y: 10 } });
        await tablet.keyboard.press("End");
        await startMotion(tablet);
        await tablet.keyboard.insertText(LINE);
        await tablet.waitForTimeout(450);
        expectCalm(await stopMotion(tablet), "Tippen auf dem Tablet");
      } finally {
        await context.close();
      }
    });
  }

  test("AC-16: Das Referenzkapitel behält Seitenzahl und Umbrüche", async ({ page }) => {
    await page.goto(chapterUrl("reference"));
    await page.locator('.a5-stack[data-ready="1"]').waitFor({ timeout: 25_000 });
    await page.waitForTimeout(700);
    const layout = await layoutFingerprint(page);
    expect(layout.pages).toBe(41);
    expect(layout.spacers).toBe(40);
    expect(layout.hash).toBe(REFERENCE_HASH);
  });

  test("AC-18: Tippen bleibt im langen Kapitel flüssig", async ({ page }) => {
    await openChapter(page, "typing");
    await page.locator(TEXT_BLOCKS).nth(50).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const w = window as unknown as { __keys: number[] };
      w.__keys = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.name === "keydown") w.__keys.push(entry.duration);
      }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
    });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.type("a");
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
    const keys = await page.evaluate(() => (window as unknown as { __keys: number[] }).__keys);
    const sorted = [...keys].sort((x, y) => x - y);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    test.info().annotations.push({ type: "Tippen p95", description: `${p95} ms` });
    expect(p95, "95 % der Tasten erscheinen in unter 0,1 s").toBeLessThan(100);
  });

  test("AC-21 bis AC-23: Beim Öffnen gibt es nur einen Ladezustand", async ({ page }) => {
    const watch = () =>
      page.evaluate(() => {
        const w = window as unknown as { __states: string[]; __watch?: boolean };
        w.__states = [];
        w.__watch = true;
        const visible = (el: Element) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility === "visible";
        };
        const tick = () => {
          if (!w.__watch) return;
          const hint = Array.from(document.querySelectorAll('[role="status"]')).find(
            (el) => el.textContent?.includes("Wird geladen") && visible(el),
          );
          const state = hint ? (hint.closest("[data-editor-loading]") ? "sheet" : "other") : document.querySelector('.a5-stack[data-visible="1"]') ? "chapter" : "none";
          if (w.__states[w.__states.length - 1] !== state) w.__states.push(state);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    for (let run = 0; run < 3; run += 1) {
      await page.goto(`/projektuebersicht/${projectId}`);
      const link = page.locator(`a[href$="/kapiteleditor/${chapters.open}"]`);
      await link.waitFor();
      await page.waitForTimeout(500);
      await watch();
      await link.click();
      await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(400);
      const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
      expect(states, "kein zweiter Ladezustand").not.toContain("other");
      expect(states.filter((state) => state === "sheet").length, "höchstens eine Ladeansicht").toBeLessThanOrEqual(1);
    }

    await page.addInitScript(() => {
      const w = window as unknown as { __states: string[] };
      w.__states = [];
      const tick = () => {
        const hint = Array.from(document.querySelectorAll('[role="status"]')).find((el) => el.textContent?.includes("Wird geladen"));
        const state = hint ? (hint.closest("[data-editor-loading]") ? "sheet" : "other") : "none";
        if (w.__states[w.__states.length - 1] !== state) w.__states.push(state);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.reload();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
    const reloaded = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
    expect(reloaded).not.toContain("other");
  });

  test("AC-23: Auch mit Zurück und Vorwärts nur ein Ladezustand", async ({ page }) => {
    await page.goto(`/projektuebersicht/${projectId}`);
    const link = page.locator(`a[href$="/kapiteleditor/${chapters.open}"]`);
    await link.waitFor();
    await page.waitForTimeout(400);
    await link.click();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    const watchStates = () =>
      page.evaluate(() => {
        const w = window as unknown as { __states: string[]; __on?: boolean };
        w.__states = [];
        if (w.__on) return;
        w.__on = true;
        const tick = () => {
          const hint = Array.from(document.querySelectorAll('[role="status"]')).find((el) => {
            const box = el.getBoundingClientRect();
            return el.textContent?.includes("Wird geladen") && box.width > 0 && getComputedStyle(el).visibility === "visible";
          });
          const state = hint ? (hint.closest("[data-editor-loading]") ? "sheet" : "other") : "none";
          if (w.__states[w.__states.length - 1] !== state) w.__states.push(state);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    await page.goBack();
    await page.locator(`a[href$="/kapiteleditor/${chapters.open}"]`).waitFor();
    await page.waitForTimeout(500);
    await watchStates();
    await page.goForward();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
    await expect(page.locator(".tiptap-editor")).toBeVisible();
    await page.waitForTimeout(500);
    const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
    expect(states).not.toContain("other");
    expect(states.filter((state) => state === "sheet").length).toBeLessThanOrEqual(1);
  });

  test("AC-25: Auf dem Phone nur der Hinweis", async ({ browser }) => {
    const context = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 375, height: 760 } });
    try {
      const phone = await context.newPage();
      await phone.goto(chapterUrl("open"));
      await expect(phone.getByText("Editor auf dem Smartphone nicht verfügbar")).toBeVisible();
      await phone.waitForTimeout(1_200);
      await expect(phone.locator("[data-editor-loading]:visible")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
