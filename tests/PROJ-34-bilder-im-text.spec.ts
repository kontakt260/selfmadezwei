import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditEditor } from "./helpers/editor-audit";
import { solidPng, startMotion, stopMotion } from "./helpers/editor-bench";
import { assertStage, createTestAccount, readEnvLocal, signIn, type TestAccount } from "./helpers/stage";

// PROJ-34: Bildabschnitte an jeder Textstelle und Hochkant. Eigene temporäre
// Konten und Daten auf Stage, die echte Cron-Route wird nie aufgerufen.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-34-bilder-im-text.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj34-${RUN_ID}.json`);
const FILE_DIR = path.join(os.tmpdir(), `e2e-proj34-${RUN_ID}`);
const SENTENCE = "Damals gingen wir jeden Morgen gemeinsam den langen Weg durch das Dorf zur Schule. ";
const QUEUE = "storage_image_cleanup_queue";

type Photo = { id: string; storage_path: string; signed_url: string; alt: string; format?: "hoch" };
type Block = Record<string, unknown>;
type ChapterKey =
  | "leer" | "alt" | "teilen" | "nachbar" | "entfernen" | "markierung" | "hochkant"
  | "viele" | "steuerung" | "letztes" | "ende" | "tablet" | "format";

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
const chapters = {} as Record<ChapterKey, string>;

const para = (text?: string): Block =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
const prose = (index: number, repeat = 4) => para(`${index + 1}. ${SENTENCE.repeat(repeat)}`);
const section = (sectionId: string): Block => ({ type: "imageSection", attrs: { sectionId } });
const doc = (...content: Block[]) => ({ type: "doc", content });
const empty = { layout: "1-spaltig", images: [] as Photo[] };

const chapterUrl = (key: ChapterKey) => `/projektuebersicht/${projectId}/kapiteleditor/${chapters[key]}`;

async function openChapter(page: Page, key: ChapterKey) {
  await page.goto(chapterUrl(key));
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.waitForTimeout(500);
}

/** Aufbau des Textes: Absatztext, „S" für Bildabschnitte. */
const blocks = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".tiptap-editor > *"))
      .filter((el) => !el.classList.contains("a5-block-push-spacer"))
      .map((el) =>
        el.matches("[data-image-section], .node-imageSection")
          ? "S"
          : (el.textContent ?? "").replace(/­/g, "").trim(),
      ),
  );

const sectionsInText = (page: Page) => page.locator(".tiptap-editor [data-image-section-wrapper]");
const tool = (page: Page) => page.getByRole("button", { name: /^Bildabschnitt einfügen/ });

/** Cursor an den Anfang des Absatzes, dann `offset` Zeichen weiter (Home/End wirken auf dem Mac nicht). */
async function cursorInParagraph(page: Page, text: string, offset = 0) {
  await page.locator(".tiptap-editor > p", { hasText: text }).first().click({ position: { x: 1, y: 4 } });
  // ProseMirror übernimmt die Cursorstelle erst mit dem nächsten selectionchange.
  await page.waitForTimeout(150);
  for (let i = 0; i < offset; i += 1) await page.keyboard.press("ArrowRight");
}

async function waitSaved(page: Page) {
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function queued(chapterId: string): Promise<number> {
  const { count, error } = await admin.from(QUEUE).select("*", { count: "exact", head: true }).eq("chapter_id", chapterId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

test.describe("PROJ-34 — Bilder im Text und Hochkant", () => {
  test.use({ storageState: SESSION_FILE });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const env = readEnvLocal();
    assertStage(env);
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    account = await createTestAccount(admin, { email: `e2e-proj34-${RUN_ID}@example.test`, name: "Test Bilder" });
    const { data: project, error } = await admin
      .from("projects")
      .insert({ title: "Bilder im Text", owner_id: account.id })
      .select("id")
      .single();
    if (error || !project) throw new Error(error?.message ?? "Projekt fehlt");
    projectId = project.id as string;
    await admin.from("project_access").insert({ project_id: projectId, expires_at: "2028-06-15T12:00:00Z" });
    await admin.from("project_members").insert({ project_id: projectId, user_id: account.id, role: "projektleiter" });

    const keys: ChapterKey[] = [
      "leer", "alt", "teilen", "nachbar", "entfernen", "markierung", "hochkant",
      "viele", "steuerung", "letztes", "ende", "tablet", "format",
    ];
    for (const key of keys) chapters[key] = crypto.randomUUID();

    // Fotos liegen wie im echten Upload im Ordner ihres Kapitels.
    const photo = async (key: ChapterKey, format?: "hoch"): Promise<Photo> => {
      const id = crypto.randomUUID();
      const storage_path = `${projectId}/${chapters[key]}/${id}.png`;
      const [w, h] = format ? [400, 600] : [600, 400];
      const { error: uploadError } = await admin.storage
        .from("chapter-heroes")
        .upload(storage_path, solidPng(w, h, format ? [208, 188, 166] : [150, 184, 151]), { contentType: "image/png" });
      if (uploadError) throw new Error(uploadError.message);
      return { id, storage_path, signed_url: "", alt: "", ...(format ? { format } : {}) };
    };
    const placed = (inline: Record<string, unknown>) => ({ start: empty, end: empty, inline, placed: true });

    const ids = Array.from({ length: 24 }, () => crypto.randomUUID());
    const viele: Block[] = [];
    const vieleInline: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) {
      viele.push(prose(i, 2 + (i % 4)), section(ids[i]));
      vieleInline[ids[i]] = { layout: i % 2 ? "2-spaltig" : "1-spaltig", images: [await photo("viele", i % 3 ? undefined : "hoch")] };
    }
    viele.push(para("Ende."));

    const rows: Array<[ChapterKey, unknown, unknown]> = [
      ["leer", doc(para()), { start: empty, end: empty }],
      ["alt", doc(prose(0), prose(1)), { start: { layout: "1-spaltig", images: [await photo("alt")] }, end: { layout: "1-spaltig", images: [await photo("alt")] } }],
      ["teilen", doc(para("Erster Teil zweiter Teil"), prose(1)), { start: empty, end: empty }],
      ["nachbar", doc(section(ids[20]), para("Zwischenzeile"), section(ids[21]), para()),
        placed({ [ids[20]]: { layout: "1-spaltig", images: [await photo("nachbar")] }, [ids[21]]: { layout: "1-spaltig", images: [await photo("nachbar")] } })],
      ["entfernen", doc(para("Davor"), section(ids[0]), para("Danach")),
        placed({ [ids[0]]: { layout: "2-spaltig", images: [await photo("entfernen"), await photo("entfernen")] } })],
      ["markierung", doc(para("Eins"), section(ids[1]), para("Zwei")),
        placed({ [ids[1]]: { layout: "1-spaltig", images: [await photo("markierung")] } })],
      ["hochkant", doc(section(ids[2]), para("Nach eins"), section(ids[3]), para("Nach zwei"), section(ids[4]), para("Nach drei"), section(ids[5]), para("Nach vier")),
        placed({
          [ids[2]]: { layout: "1-spaltig", images: [await photo("hochkant", "hoch")] },
          [ids[3]]: { layout: "2-spaltig", images: [await photo("hochkant", "hoch"), await photo("hochkant", "hoch")] },
          [ids[4]]: { layout: "2-spaltig", images: [await photo("hochkant"), await photo("hochkant", "hoch")] },
          [ids[5]]: { layout: "2-spaltig", images: [await photo("hochkant", "hoch"), await photo("hochkant")] },
        })],
      ["viele", doc(...viele), placed(vieleInline)],
      ["steuerung", doc(prose(0, 2), section(ids[6]), para("Danach")),
        placed({ [ids[6]]: { layout: "1-spaltig", images: [await photo("steuerung"), await photo("steuerung"), await photo("steuerung"), await photo("steuerung")] } })],
      ["letztes", doc(para("Davor"), section(ids[7]), para("Danach")),
        placed({ [ids[7]]: { layout: "1-spaltig", images: [await photo("letztes")] } })],
      ["ende", doc(...Array.from({ length: 5 }, (_, i) => prose(i)), section(ids[8]), para()),
        placed({ [ids[8]]: { layout: "1-spaltig", images: [await photo("ende")] } })],
      ["tablet", doc(para("Davor"), section(ids[9]), para("Danach")),
        placed({ [ids[9]]: { layout: "1-spaltig", images: [await photo("tablet")] } })],
      ["format", doc(para("Erster Absatz"), para("Zweiter Absatz")), { start: empty, end: empty }],
    ];
    const inserts = rows.map(([key, body, image_sections], index) => ({
      id: chapters[key],
      project_id: projectId,
      title: `Kapitel ${key}`,
      sort_order: index,
      chapter_origin: "custom",
      body,
      word_count: 10,
      page_count: 1,
      image_sections,
    }));
    const { error: chapterError } = await admin.from("chapters").insert(inserts as never, { defaultToNull: false });
    if (chapterError) throw new Error(chapterError.message);

    fs.mkdirSync(FILE_DIR, { recursive: true });
    fs.writeFileSync(path.join(FILE_DIR, "hoch.png"), solidPng(1000, 1600, [120, 150, 180]));

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await signIn(await context.newPage(), account);
    await context.storageState({ path: SESSION_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    fs.rmSync(SESSION_FILE, { force: true });
    fs.rmSync(FILE_DIR, { recursive: true, force: true });
    if (!admin) return;
    if (projectId) {
      const { data: folders } = await admin.storage.from("chapter-heroes").list(projectId);
      for (const folder of folders ?? []) {
        const { data: files } = await admin.storage.from("chapter-heroes").list(`${projectId}/${folder.name}`, { limit: 100 });
        if (files?.length) {
          await admin.storage.from("chapter-heroes").remove(files.map((file) => `${projectId}/${folder.name}/${file.name}`));
        }
      }
      await admin.from(QUEUE).delete().eq("project_id", projectId);
      await admin.from("projects").delete().eq("id", projectId);
      await admin.from("trash_chapters").delete().eq("project_id", projectId);
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
    }
    if (account) await admin.auth.admin.deleteUser(account.id);
  });

  test("AC-1, AC-11: Ein neues Kapitel hat keinen Platzhalter, nichts nimmt Druckplatz weg", async ({ page }) => {
    await openChapter(page, "leer");
    await expect(page.getByRole("button", { name: "Bild hinzufügen" })).toHaveCount(0);
    await expect(sectionsInText(page)).toHaveCount(0);
    await expect(tool(page)).toBeEnabled();
    const chromeInFlow = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".a5-stack .editor-chrome")).filter(
        (el) => !["absolute", "fixed"].includes(getComputedStyle(el).position),
      ).length,
    );
    expect(chromeInFlow).toBe(0);
  });

  test("AC-2: Alte Kapitel zeigen ihre Fotos an Anfang und Ende und speichern beim Öffnen nichts", async ({ page }) => {
    const before = await admin.from("chapters").select("updated_at, body, image_sections").eq("id", chapters.alt).single();
    await openChapter(page, "alt");
    expect(await blocks(page)).toEqual(["S", expect.stringContaining("1."), expect.stringContaining("2."), "S", ""]);
    await expect(page.locator(".tiptap-editor img")).toHaveCount(2);
    await page.waitForTimeout(3_000);
    const after = await admin.from("chapters").select("updated_at, body, image_sections").eq("id", chapters.alt).single();
    expect(after.data?.updated_at).toBe(before.data?.updated_at);
    expect(after.data?.image_sections).toEqual(before.data?.image_sections);
  });

  test("AC-3 bis AC-9, AC-26, AC-27, AC-31: Foto zuerst, dann der Abschnitt an der Cursorstelle", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openChapter(page, "teilen");
    await cursorInParagraph(page, "Erster Teil", "Erster Teil".length);

    // Abbrechen ändert nichts.
    await tool(page).click();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    expect(await blocks(page)).toEqual(["Erster Teil zweiter Teil", expect.stringContaining("2.")]);

    await tool(page).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILE_DIR, "hoch.png"));
    await expect(page.getByRole("radio", { name: "Hochformat" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect(sectionsInText(page)).toHaveCount(1, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["Erster Teil", "S", "zweiter Teil", expect.stringContaining("2.")]);

    // Der Cursor steht in der Zeile hinter dem Abschnitt.
    await page.keyboard.type("Weiter ");
    expect(await blocks(page)).toEqual(["Erster Teil", "S", "Weiter zweiter Teil", expect.stringContaining("2.")]);
    await waitSaved(page);
    await page.screenshot({ path: testInfo.outputPath("eingefuegt.png") });

    await page.reload();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
    expect(await blocks(page)).toEqual(["Erster Teil", "S", "Weiter zweiter Teil", expect.stringContaining("2.")]);
    await expect(page.locator(".tiptap-editor .image-slot")).toHaveAttribute("data-format", "hoch");
    const { data } = await admin.from("chapters").select("image_sections").eq("id", chapters.teilen).single();
    const saved = data?.image_sections as { placed?: boolean; inline?: Record<string, { images: Photo[] }> };
    expect(saved.placed).toBe(true);
    const [only] = Object.values(saved.inline ?? {});
    expect(only.images[0].storage_path.startsWith(`${projectId}/${chapters.teilen}/`)).toBe(true);
    expect(only.images[0].format).toBe("hoch");
  });

  test("Formatierungen bleiben nach dem Speichern erhalten", async ({ page }) => {
    await openChapter(page, "format");
    const target = page.locator(".tiptap-editor > p").last();
    await target.click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(150);
    await page.getByLabel("Zeilenabstand").click();
    await page.getByRole("option", { name: "2,0" }).click();
    await expect(target).toHaveAttribute("data-line-height", "2");
    await waitSaved(page);
    const { data } = await admin.from("chapters").select("body").eq("id", chapters.format).single();
    expect(JSON.stringify(data?.body)).toContain('"lineHeight":"2"');
    await page.reload();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 20_000 });
    await expect(page.locator(".tiptap-editor > p").last()).toHaveAttribute("data-line-height", "2");
  });

  test("AC-13 bis AC-15: Zwischen zwei Abschnitten bleibt immer eine Zeile", async ({ page }) => {
    await openChapter(page, "nachbar");
    await cursorInParagraph(page, "Zwischenzeile", 4);
    await expect(tool(page)).toBeDisabled();
    await expect(tool(page)).toHaveAttribute("title", /mindestens eine Textzeile/);

    // Dreifachklick markiert die ganze Zeile, auch mit weichen Trennstellen im Wort.
    await page.locator(".tiptap-editor > p", { hasText: "Zwischen" }).click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    expect(await blocks(page)).toEqual(["S", "", "S", ""]);
    await page.keyboard.type("neu");
    expect(await blocks(page)).toEqual(["S", "neu", "S", ""]);
  });

  test("AC-16, AC-17, AC-19, AC-20: Zurücktaste fragt nach, Rückgängig holt die Fotos zurück", async ({ page }) => {
    test.setTimeout(90_000);
    await openChapter(page, "entfernen");
    await cursorInParagraph(page, "Danach");
    await page.keyboard.press("Backspace");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Bildabschnitt mit 2 Fotos entfernen?");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toBeHidden();
    await expect(sectionsInText(page)).toHaveCount(1);
    // Der Fokus kehrt in den Text zurück, der Cursor steht noch am selben Platz.
    await expect(page.locator(".tiptap-editor")).toBeFocused();

    await page.keyboard.press("Backspace");
    await page.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click();
    await expect(sectionsInText(page)).toHaveCount(0);
    expect(await blocks(page)).toEqual(["Davor", "Danach"]);
    await waitSaved(page);
    await expect.poll(() => queued(chapters.entfernen)).toBe(2);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(sectionsInText(page)).toHaveCount(1);
    await expect(page.locator(".tiptap-editor img")).toHaveCount(2);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>(".tiptap-editor img")).every((img) => img.complete && img.naturalWidth > 0),
    );
    await waitSaved(page);
    await expect.poll(() => queued(chapters.entfernen)).toBe(0);
  });

  test("AC-18: Auch eine Markierung über den Abschnitt fragt nach", async ({ page }) => {
    await openChapter(page, "markierung");
    await cursorInParagraph(page, "Eins");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toContainText("Bildabschnitt mit 1 Foto entfernen?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Abbrechen" }).click();
    expect(await blocks(page)).toEqual(["Eins", "S", "Zwei"]);
  });

  test("AC-28 bis AC-30: Hochformat allein und gemischt mit Querformat", async ({ page }, testInfo) => {
    await openChapter(page, "hochkant");
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".tiptap-editor [data-paginate-row]")).map((row) => ({
        width: row.getBoundingClientRect().width,
        scaled: Boolean(row.style.getPropertyValue("--row-image-scale")),
        slots: Array.from(row.querySelectorAll(".image-slot")).map((slot) => {
          const r = slot.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      })),
    );
    expect(rows).toHaveLength(4);
    const [single, twoPortraits, mixed, mixedReverse] = rows;
    // Ein Hochformat steht in zwei Dritteln der Textbreite, Seitenverhältnis 2:3.
    expect(single.scaled).toBe(false);
    expect(single.slots[0].w / single.width).toBeCloseTo(2 / 3, 2);
    expect(single.slots[0].h / single.slots[0].w).toBeCloseTo(1.5, 2);
    // Zwei Hochformate sind gleich groß.
    expect(Math.abs(twoPortraits.slots[0].w - twoPortraits.slots[1].w)).toBeLessThan(1);
    expect(twoPortraits.slots[0].h / twoPortraits.slots[0].w).toBeCloseTo(1.5, 2);
    // Gemischt: gleich hoch und zusammen so breit wie der Text, in beiden Reihenfolgen.
    for (const row of [mixed, mixedReverse]) {
      expect(Math.abs(row.slots[0].h - row.slots[1].h)).toBeLessThan(1);
      const gap = row.width - row.slots[0].w - row.slots[1].w;
      expect(gap).toBeGreaterThan(10);
      expect(gap).toBeLessThan(20);
    }
    expect(mixed.slots[0].w).toBeGreaterThan(mixed.slots[1].w);
    expect(mixedReverse.slots[0].w).toBeLessThan(mixedReverse.slots[1].w);
    await page.screenshot({ path: testInfo.outputPath("hochkant.png"), fullPage: true });
  });

  test("AC-22 bis AC-25: Viele Abschnitte bleiben in den Seiten, Tippen bewegt einmal", async ({ page }) => {
    await openChapter(page, "viele");
    expect((await auditEditor(page)).violations).toEqual([]);
    await cursorInParagraph(page, "1. Damals");
    await startMotion(page);
    // Eine einzige Eingabe, wie beim Einfügen eines Satzes.
    await page.keyboard.insertText(SENTENCE);
    await page.waitForTimeout(500);
    const motion = await stopMotion(page);
    expect(motion.returns).toBe(0);
    expect(motion.settleMs).toBeLessThanOrEqual(150);
    expect((await auditEditor(page)).violations).toEqual([]);
  });

  test("PROJ-25 BUG-2: Die Steuerung erscheint an der Reihe unter der Maus", async ({ page }) => {
    await openChapter(page, "steuerung");
    const row = page.locator(".tiptap-editor [data-paginate-row]").nth(2);
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await row.hover();
    const toggle = page.getByLabel("2 Bilder nebeneinander");
    await expect(toggle).toBeVisible();
    const inside = await row.evaluate((el) => {
      const control = el.querySelector("[aria-label='2 Bilder nebeneinander']");
      return Boolean(control);
    });
    expect(inside).toBe(true);
  });

  test("AC-42: Mit dem letzten Foto verschwindet der Abschnitt, Rückgängig holt ihn zurück", async ({ page }) => {
    await openChapter(page, "letztes");
    const image = page.locator(".tiptap-editor img").first();
    await image.hover();
    await page.getByLabel("Bild löschen").click();
    await expect(page.getByRole("alertdialog")).toContainText("letzte Foto");
    await page.getByRole("alertdialog").getByRole("button", { name: "Bild entfernen" }).click();
    await expect(sectionsInText(page)).toHaveCount(0);
    await page.locator(".tiptap-editor > p", { hasText: "Davor" }).click();
    await page.waitForTimeout(150);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(sectionsInText(page)).toHaveCount(1);
    await expect(page.locator(".tiptap-editor img")).toHaveCount(1);
  });

  test("Kapitelende: Die leere Zeile hinter dem letzten Abschnitt erzeugt keine Seite", async ({ page }) => {
    await openChapter(page, "ende");
    await expect(page.locator(".tiptap-editor > p").last()).toHaveClass(/a5-trailing-line/);
    const pages = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll(".a5-page-frame")).map((frame) => frame.getBoundingClientRect());
      const rows = document.querySelectorAll(".tiptap-editor [data-paginate-row]");
      const last = rows[rows.length - 1].getBoundingClientRect();
      const rowPage = frames.findIndex((frame) => last.top >= frame.top - 1 && last.bottom <= frame.bottom + 1) + 1;
      return { frames: frames.length, rowPage };
    });
    expect(pages.frames).toBe(pages.rowPage);
  });

  test("AC-40: Auf dem Tablet fragt die Zurücktaste ebenfalls nach", async ({ browser }) => {
    const context = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 1024, height: 768 }, hasTouch: true });
    try {
      const tablet = await context.newPage();
      await openChapter(tablet, "tablet");
      await expect(tool(tablet)).toBeVisible();
      await tablet.locator(".tiptap-editor > p", { hasText: "Danach" }).tap({ position: { x: 1, y: 4 } });
      await tablet.waitForTimeout(150);
      await tablet.keyboard.press("Backspace");
      await expect(tablet.getByRole("alertdialog")).toContainText("Bildabschnitt mit 1 Foto entfernen?");
      await tablet.getByRole("alertdialog").getByRole("button", { name: "Abbrechen" }).tap();
      await expect(sectionsInText(tablet)).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
});
