import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditEditor } from "./helpers/editor-audit";
import { solidPng } from "./helpers/editor-bench";
import {
  accessToken,
  assertStage,
  createTestAccount,
  readEnvLocal,
  restRequest,
  signIn,
  type TestAccount,
} from "./helpers/stage";

// PROJ-34 QA (2026-11-24): Prüfungen, die die Bau-Tests nicht abdecken. Einfügen an
// allen Stellen, Zuschnitt-Dialog, Funktionen im Abschnitt, alle Löschwege, Kopieren,
// Grenzen, Seitenzahl, Papierkorb, Red Team, Lesemodus, Druck, Phone und Tablet.
// Eigene temporäre Konten und Daten auf Stage, die echte Cron-Route wird nie aufgerufen.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-34-bilder-pruefliste.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj34-qa-${RUN_ID}.json`);
const FILES = path.join(os.tmpdir(), `e2e-proj34-qa-${RUN_ID}`);
const QUEUE = "storage_image_cleanup_queue";
const SENTENCE = "Damals gingen wir jeden Morgen gemeinsam den langen Weg durch das Dorf zur Schule. ";

type Photo = { id: string; storage_path: string; signed_url: string; alt: string; format?: "hoch" };
type Block = Record<string, unknown>;

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
let readOnlyProject = "";
let supabaseUrl = "";
let anonKey = "";
const ch: Record<string, string> = {};

const para = (text?: string): Block => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
const prose = (i: number, repeat = 4) => para(`${i + 1}. ${SENTENCE.repeat(repeat)}`);
const section = (sectionId: string): Block => ({ type: "imageSection", attrs: { sectionId } });
const doc = (...content: Block[]) => ({ type: "doc", content });
const empty = { layout: "1-spaltig", images: [] as Photo[] };
const placed = (inline: Record<string, unknown>) => ({ start: empty, end: empty, inline, placed: true });

async function open(page: Page, key: string, project = projectId) {
  await page.goto(`/projektuebersicht/${project}/kapiteleditor/${ch[key]}`);
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.waitForTimeout(500);
}

/** Aufbau des Textes: Absatztext, „S" für Bildabschnitte, Tags für Liste und Zitat. */
const blocks = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".tiptap-editor > *"))
      .filter((el) => !el.classList.contains("a5-block-push-spacer"))
      .map((el) => {
        if (el.matches(".node-imageSection")) return "S";
        if (el.matches("ul, ol")) return `<${el.tagName.toLowerCase()}>`;
        if (el.matches("blockquote")) return "<blockquote>";
        return (el.textContent ?? "").replace(/­/g, "").trim();
      }),
  );
const sections = (page: Page) => page.locator(".tiptap-editor [data-image-section-wrapper]");
const tool = (page: Page) => page.getByRole("button", { name: /^Bildabschnitt einfügen/ });

/** Cursor an den Anfang des Blocks, dann `offset` Zeichen weiter (Home/End wirken auf dem Mac nicht). */
async function caretAt(page: Page, text: string, offset = 0, selector = ".tiptap-editor p") {
  await page.locator(selector, { hasText: text }).first().click({ position: { x: 1, y: 4 } });
  // ProseMirror übernimmt die Cursorstelle erst mit dem nächsten selectionchange.
  await page.waitForTimeout(150);
  for (let i = 0; i < offset; i += 1) await page.keyboard.press("ArrowRight");
}
async function insertViaTool(page: Page, file: string) {
  await tool(page).click();
  await page.locator('input[type="file"]').setInputFiles(path.join(FILES, file));
  await page.getByRole("button", { name: "Übernehmen" }).click();
}
const saved = (page: Page) => expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 20_000 });
const pasteHtml = (page: Page, html: string) =>
  page.evaluate((value) => {
    const el = document.querySelector(".tiptap-editor") as HTMLElement & { editor: { view: { pasteHTML: (h: string) => void } } };
    el.editor.view.pasteHTML(value);
  }, html);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const env = readEnvLocal();
  assertStage(env);
  supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  account = await createTestAccount(admin, { email: `e2e-proj34-qa-${RUN_ID}@example.test`, name: "Test QA Bilder" });
  fs.mkdirSync(FILES, { recursive: true });
  fs.writeFileSync(path.join(FILES, "quer.png"), solidPng(1600, 1000, [120, 150, 180]));
  fs.writeFileSync(path.join(FILES, "hoch.png"), solidPng(1000, 1600, [180, 150, 120]));
  fs.writeFileSync(path.join(FILES, "klein-hoch.png"), solidPng(600, 900, [90, 120, 90]));
  fs.writeFileSync(path.join(FILES, "panorama.png"), solidPng(2400, 600, [60, 90, 120]));

  // Ein Projekt mit Zugang und eines im Lesemodus (Zugang abgelaufen).
  for (const [label, expires] of [["haupt", "2028-06-15T12:00:00Z"], ["lesen", new Date(Date.now() - 5 * 86_400_000).toISOString()]] as const) {
    const id = crypto.randomUUID();
    await admin.from("projects").insert({ id, title: `QA ${label} ${RUN_ID}`, owner_id: account.id });
    await admin.from("project_access").insert({ project_id: id, expires_at: expires });
    await admin.from("project_members").insert({ project_id: id, user_id: account.id, role: "projektleiter" });
    if (label === "haupt") projectId = id;
    else readOnlyProject = id;
  }

  const keys = ["anfang", "wort", "liste", "zitat", "funktionen", "loeschwege", "druck", "lesen", "umbruch", "ungerade", "limit60", "limit120", "kopie", "fremdhtml", "verlassen", "fehler", "papierkorb", "angriff", "seitenzahl", "folge", "formatierung", "ladefehler"];
  for (const key of keys) ch[key] = crypto.randomUUID();
  // Fotos liegen wie im echten Upload im Ordner ihres Kapitels.
  const photo = async (key: string, format?: "hoch", project = projectId): Promise<Photo> => {
    const id = crypto.randomUUID();
    const storage_path = `${project}/${ch[key]}/${id}.png`;
    const [w, h] = format ? [400, 600] : [600, 400];
    const { error } = await admin.storage.from("chapter-heroes").upload(storage_path, solidPng(w, h, [150, 184, 151]), { contentType: "image/png" });
    if (error) throw new Error(error.message);
    return { id, storage_path, signed_url: "", alt: "", ...(format ? { format } : {}) };
  };
  const ids = Array.from({ length: 16 }, () => crypto.randomUUID());
  // Für die Grenzen genügt eine Datei, die Fotos tragen nur verschiedene IDs.
  const shared = await photo("limit60");
  const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ ...shared, id: `${prefix}-${i}` }));

  const rows: Array<[string, unknown, unknown, string?]> = [
    ["anfang", doc(para("Erster Absatz"), para("Zweiter Absatz")), { start: empty, end: empty }],
    ["wort", doc(para("Großmutter erzählte viel von früher")), { start: empty, end: empty }],
    ["liste", doc(para("Davor"), { type: "bulletList", content: [{ type: "listItem", content: [para("Punkt eins")] }, { type: "listItem", content: [para("Punkt zwei")] }] }, para("Danach")), { start: empty, end: empty }],
    ["zitat", doc(para("Davor"), { type: "blockquote", content: [para("Ein Zitat")] }, para("Danach")), { start: empty, end: empty }],
    ["funktionen", doc(para("Davor"), section(ids[0]), para("Danach")), placed({ [ids[0]]: { layout: "1-spaltig", images: [await photo("funktionen"), await photo("funktionen", "hoch")] } })],
    ["loeschwege", doc(para("Anfang Text"), section(ids[1]), para("Ende Text")), placed({ [ids[1]]: { layout: "1-spaltig", images: [await photo("loeschwege")] } })],
    ["druck", doc(prose(0), section(ids[2]), para()), placed({ [ids[2]]: { layout: "2-spaltig", images: [await photo("druck"), await photo("druck", "hoch")] } })],
    ["umbruch", doc(...Array.from({ length: 3 }, (_, i) => prose(i)), { type: "pageBreak" }, section(ids[3]), para("Nach dem Bild"), section(ids[4]), { type: "pageBreak" }, para("Nach dem Umbruch")),
      placed({ [ids[3]]: { layout: "1-spaltig", images: [await photo("umbruch")] }, [ids[4]]: { layout: "1-spaltig", images: [await photo("umbruch")] } })],
    ["ungerade", doc(para("Drei Fotos"), section(ids[5]), para()), placed({ [ids[5]]: { layout: "2-spaltig", images: [await photo("ungerade"), await photo("ungerade"), await photo("ungerade", "hoch")] } })],
    ["limit60", doc(para("Voll"), section(ids[7]), para()), placed({ [ids[7]]: { layout: "2-spaltig", images: many(60, "a") } })],
    ["limit120", doc(para("Voll"), section(ids[8]), para("Mitte"), section(ids[9]), para()), placed({ [ids[8]]: { layout: "2-spaltig", images: many(60, "b") }, [ids[9]]: { layout: "2-spaltig", images: many(60, "c") } })],
    ["kopie", doc(para("Text vor dem Bild"), section(ids[10]), para("Text nach dem Bild")), placed({ [ids[10]]: { layout: "1-spaltig", images: [await photo("kopie")] } })],
    ["fremdhtml", doc(para("Hier einfügen")), { start: empty, end: empty }],
    ["verlassen", doc(para("Schnell weg")), { start: empty, end: empty }],
    ["fehler", doc(para("Upload bricht ab")), { start: empty, end: empty }],
    ["papierkorb", doc(para("Wird gelöscht"), section(ids[11]), para("Ende")), placed({ [ids[11]]: { layout: "1-spaltig", images: [await photo("papierkorb")] } })],
    ["angriff", doc(para("Ziel")), placed({})],
    ["seitenzahl", doc(...Array.from({ length: 4 }, (_, i) => prose(i))), { start: empty, end: empty }],
    ["folge", doc(para("Folgekapitel")), { start: empty, end: empty }],
    ["formatierung", doc(para("Mittig und eingerückt")), { start: empty, end: empty }],
    ["ladefehler", doc(para("Foto lädt nach"), section(ids[12]), para()), placed({ [ids[12]]: { layout: "1-spaltig", images: [await photo("ladefehler")] } })],
    ["lesen", doc(para("Nur lesen"), section(ids[13]), para("Ende")), placed({ [ids[13]]: { layout: "1-spaltig", images: [await photo("lesen", undefined, readOnlyProject)] } }), readOnlyProject],
  ];
  const inserts = rows.map(([key, body, image_sections, project], index) => ({
    id: ch[key], project_id: project ?? projectId, title: `QA ${key}`, sort_order: index, chapter_origin: "custom", body, word_count: 5, page_count: 1, image_sections,
  }));
  const { error } = await admin.from("chapters").insert(inserts as never, { defaultToNull: false });
  if (error) throw new Error(error.message);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await signIn(await context.newPage(), account);
  await context.storageState({ path: SESSION_FILE });
  await context.close();
});

test.afterAll(async () => {
  fs.rmSync(SESSION_FILE, { force: true });
  fs.rmSync(FILES, { recursive: true, force: true });
  if (!admin) return;
  for (const project of [projectId, readOnlyProject].filter(Boolean)) {
    const { data: folders } = await admin.storage.from("chapter-heroes").list(project);
    for (const folder of folders ?? []) {
      const { data: files } = await admin.storage.from("chapter-heroes").list(`${project}/${folder.name}`, { limit: 200 });
      if (files?.length) await admin.storage.from("chapter-heroes").remove(files.map((f) => `${project}/${folder.name}/${f.name}`));
    }
    await admin.from(QUEUE).delete().eq("project_id", project);
    await admin.from("projects").delete().eq("id", project);
    await admin.from("trash_chapters").delete().eq("project_id", project);
    await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", project);
    await admin.from("storage_cleanup_queue").delete().eq("project_id", project);
  }
  if (account) await admin.auth.admin.deleteUser(account.id);
});

test.describe("PROJ-34 — Prüfliste Bilder im Text", () => {
  test.use({ storageState: SESSION_FILE });

  test("AC-4, AC-7, AC-8: Einfügen am Kapitelanfang und -ende, mitten im Wort, nach Liste und Zitat", async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, "anfang");
    await caretAt(page, "Erster Absatz");
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["S", "Erster Absatz", "Zweiter Absatz"]);

    await page.locator(".tiptap-editor p", { hasText: "Zweiter Absatz" }).click();
    await page.waitForTimeout(150);
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await page.waitForTimeout(150);
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(2, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["S", "Erster Absatz", "Zweiter Absatz", "S", ""]);
    await saved(page);

    await open(page, "wort");
    await caretAt(page, "Großmutter", 4);
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["Großmutter", "S", "erzählte viel von früher"]);

    await open(page, "liste");
    await caretAt(page, "Punkt eins", 3, ".tiptap-editor li p");
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["Davor", "<ul>", "S", "Danach"]);

    await open(page, "zitat");
    await caretAt(page, "Ein Zitat", 2, ".tiptap-editor blockquote p");
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    expect(await blocks(page)).toEqual(["Davor", "<blockquote>", "S", "Danach"]);
  });

  test("AC-27, Edge Cases: Zuschnitt-Dialog mit Formatwahl, Panorama, kleinem Foto und abgebrochenem Upload", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "fehler");
    await caretAt(page, "Upload bricht ab", 3);

    await tool(page).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILES, "quer.png"));
    await expect(page.getByRole("radio", { name: "Querformat" })).toHaveAttribute("aria-checked", "true");
    const ratio = () =>
      page.locator(".ReactCrop__crop-selection").evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height);
    expect(await ratio()).toBeCloseTo(1.5, 1);
    await page.getByRole("radio", { name: "Hochformat" }).click();
    await expect.poll(ratio).toBeCloseTo(2 / 3, 1);
    await page.getByRole("button", { name: "Abbrechen" }).click();

    await tool(page).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILES, "panorama.png"));
    await page.waitForTimeout(300);
    const inside = await page.evaluate(() => {
      const sel = document.querySelector(".ReactCrop__crop-selection")!.getBoundingClientRect();
      const img = document.querySelector(".ReactCrop img")!.getBoundingClientRect();
      return sel.top >= img.top - 1 && sel.bottom <= img.bottom + 1 && sel.left >= img.left - 1 && sel.right <= img.right + 1;
    });
    expect(inside).toBe(true);
    await page.getByRole("button", { name: "Abbrechen" }).click();

    await tool(page).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILES, "klein-hoch.png"));
    await expect(page.getByText(/985 px/)).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Abbrechen" }).click();

    await page.route("**/storage/v1/object/upload/sign/**", (route) => route.abort());
    await tool(page).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILES, "quer.png"));
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.getByText("Bild-Upload fehlgeschlagen.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Übernehmen" })).toBeVisible();
    await expect(sections(page)).toHaveCount(0);
    await page.unroute("**/storage/v1/object/upload/sign/**");
    await page.getByRole("button", { name: "Abbrechen" }).click();
    expect(await blocks(page)).toEqual(["Upload bricht ab"]);
  });

  test("AC-10, AC-31: Foto hinzufügen, Layout wechseln, sortieren, löschen, Format bleibt", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "funktionen");
    const names = () =>
      page.locator(".tiptap-editor img").evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src.split("?")[0].split("/").pop()));

    // Der Dialog im Abschnitt bleibt offen (Regression: schließende Dialoge).
    await page.locator(".tiptap-editor [data-paginate-row]").first().hover();
    await page.getByRole("button", { name: "Bild hinzufügen" }).click();
    await page.locator('input[type="file"]').setInputFiles(path.join(FILES, "hoch.png"));
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.locator(".tiptap-editor img")).toHaveCount(3, { timeout: 45_000 });

    await page.locator(".tiptap-editor [data-paginate-row]").first().hover();
    await page.getByLabel("2 Bilder nebeneinander").click();
    await expect(page.locator(".tiptap-editor [data-paginate-row]")).toHaveCount(2);

    const before = await names();
    await page.getByLabel("Bild verschieben").first().focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);
    const after = await names();
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());

    await page.locator(".tiptap-editor img").last().hover();
    await page.getByLabel("Bild löschen").last().click();
    await expect(page.getByRole("alertdialog")).toContainText("Bild entfernen?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Bild entfernen" }).click();
    await expect(page.locator(".tiptap-editor img")).toHaveCount(2);

    await saved(page);
    const formats = () =>
      page.locator(".tiptap-editor .image-slot").evaluateAll((slots) => slots.map((s) => s.getAttribute("data-format")));
    const shown = await formats();
    expect(shown).toContain("hoch");
    await page.reload();
    await page.locator('.a5-stack[data-visible="1"]').waitFor();
    expect(await formats()).toEqual(shown);
  });

  test("AC-14, AC-18: Ausschneiden, Überschreiben und Einfügen über einen Abschnitt fragen nach", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "loeschwege");
    const ways: Array<() => Promise<void>> = [
      () => page.keyboard.press("ControlOrMeta+x"),
      () => page.keyboard.type("x"),
      () => pasteHtml(page, "<p>Neu</p>"),
    ];
    for (const act of ways) {
      await caretAt(page, "Anfang Text");
      await page.keyboard.press("ControlOrMeta+a");
      await act();
      await expect(page.getByRole("alertdialog")).toContainText("Bildabschnitt mit 1 Foto entfernen?", { timeout: 5_000 });
      await page.getByRole("alertdialog").getByRole("button", { name: "Abbrechen" }).click();
      await expect(page.getByRole("alertdialog")).toBeHidden();
      expect(await blocks(page)).toEqual(["Anfang Text", "S", "Ende Text"]);
    }
    await caretAt(page, "Ende Text");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await blocks(page)).toEqual(["Anfang Text", "S", "Ende Text"]);
  });

  test("Edge Cases: Kopierter Abschnitt und fremde Bilder aus Word kommen nicht in den Text", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "kopie");
    await caretAt(page, "Text vor");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    await caretAt(page, "Text nach", "Text nach dem Bild".length);
    await page.keyboard.press("ControlOrMeta+v");
    await page.waitForTimeout(400);
    await expect(sections(page)).toHaveCount(1);

    await open(page, "fremdhtml");
    await caretAt(page, "Hier einfügen", 4);
    await pasteHtml(
      page,
      '<p>Aus Word</p><img src="https://example.com/fremd.png"><div data-image-section="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"></div><p>Ende</p>',
    );
    await page.waitForTimeout(300);
    await expect(page.locator(".tiptap-editor img")).toHaveCount(0);
    await expect(sections(page)).toHaveCount(0);
  });

  test("Edge Cases: Seitenumbruch am Abschnitt, ungerade Bildzahl, Grenzen 60 und 120", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, "umbruch");
    expect((await auditEditor(page)).violations).toEqual([]);
    const filled = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll(".a5-page-frame")).map((f) => f.getBoundingClientRect());
      const content = Array.from(document.querySelectorAll(".tiptap-editor p, .tiptap-editor [data-paginate-row]")).map((el) => el.getBoundingClientRect());
      return frames.map((frame) => content.some((r) => r.top < frame.bottom && r.bottom > frame.top));
    });
    expect(filled.every(Boolean)).toBe(true);

    await open(page, "ungerade");
    const last = await page.evaluate(() => {
      const rows = document.querySelectorAll(".tiptap-editor [data-paginate-row]");
      const row = rows[rows.length - 1].getBoundingClientRect();
      const slot = rows[rows.length - 1].querySelector(".image-slot")!.getBoundingClientRect();
      return { leftAligned: Math.abs(slot.left - row.left) < 1, half: slot.width / row.width };
    });
    expect(last.leftAligned).toBe(true);
    expect(last.half).toBeGreaterThan(0.45);
    expect(last.half).toBeLessThan(0.5);

    await open(page, "limit60");
    await page.locator(".tiptap-editor [data-paginate-row]").first().hover();
    await expect(page.getByRole("button", { name: "Bild hinzufügen" })).toBeDisabled();

    await open(page, "limit120");
    await caretAt(page, "Voll", 2);
    await expect(tool(page)).toBeDisabled();
    await expect(tool(page)).toHaveAttribute("title", /120 Fotos/);
  });

  test("AC-24, AC-33, AC-37: Seitenzahl, Formatierung, schnelles Verlassen und Wortzahl", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "seitenzahl");
    await caretAt(page, "1. Damals", 0);
    await insertViaTool(page, "hoch.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    await saved(page);
    const frames = await page.locator(".a5-page-frame").count();
    // Eigene Seitenzahl und Startseite des Folgekapitels (PROJ-7) passen zum Editor.
    await expect
      .poll(
        async () => {
          const { data: rows } = await admin.from("chapters").select("id, page_count, start_page").in("id", [ch.seitenzahl, ch.folge]);
          const own = rows?.find((r) => r.id === ch.seitenzahl);
          const next = rows?.find((r) => r.id === ch.folge);
          return own && next ? [own.page_count, next.start_page - own.start_page] : null;
        },
        { timeout: 20_000 },
      )
      .toEqual([frames, frames]);

    // Regression: Ausrichtung und Einzug gingen beim Speichern verloren.
    await open(page, "formatierung");
    await caretAt(page, "Mittig", 2);
    await page.getByLabel("Zentriert").click();
    await page.getByLabel("Einrückung erhöhen").click();
    await saved(page);
    const { data } = await admin.from("chapters").select("body").eq("id", ch.formatierung).single();
    const json = JSON.stringify(data!.body);
    expect(json).toContain('"textAlign":"center"');
    expect(json).toContain('"indent":1');

    await open(page, "verlassen");
    await caretAt(page, "Schnell weg", 6);
    await insertViaTool(page, "quer.png");
    await expect(sections(page)).toHaveCount(1, { timeout: 45_000 });
    await page.getByRole("link", { name: "Zurück zur Projektübersicht" }).click();
    await page.waitForURL(`**/projektuebersicht/${projectId}`);
    await open(page, "verlassen");
    expect(await blocks(page)).toEqual(["Schnell", "S", "weg"]);
    await expect(page.locator("footer")).toContainText(/2\s*Wörter/);
  });

  test("AC-35: Kapitel mit Abschnitt im Text löschen und wiederherstellen", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/projektuebersicht/${projectId}`);
    const token = accessToken(await page.context().cookies());
    const del = await restRequest({ supabaseUrl, anonKey }, `chapters?id=eq.${ch.papierkorb}`, { method: "DELETE" }, token);
    expect(del.status).toBeLessThan(300);
    const trash = await admin.from("trash_chapters").select("snapshot").eq("chapter_id", ch.papierkorb).single();
    expect(JSON.stringify(trash.data?.snapshot)).toContain('"placed":true');
    const restore = await admin.rpc("trash_restore_chapter", { p_chapter_id: ch.papierkorb });
    expect(restore.error).toBeNull();
    await open(page, "papierkorb");
    await expect(sections(page)).toHaveCount(1);
    await expect.poll(() => page.locator(".tiptap-editor img").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const { count } = await admin.from(QUEUE).select("*", { count: "exact", head: true }).eq("chapter_id", ch.papierkorb);
    expect(count).toBe(0);
  });

  test("AC-19, BUG-1: Ein Foto lädt nach Ladefehlern beim Öffnen von selbst nach", async ({ page }) => {
    test.setTimeout(90_000);
    // Die ersten zwei Ladeversuche scheitern wie bei einem Netzaussetzer. Der frische
    // Link kommt in derselben Sekunde und ist deshalb identisch mit dem alten.
    let aborted = 0;
    await page.route("**/storage/v1/object/sign/chapter-heroes/**", async (route) => {
      if (aborted < 2) {
        aborted += 1;
        await route.abort();
      } else {
        await route.continue();
      }
    });
    await page.goto(`/projektuebersicht/${projectId}/kapiteleditor/${ch.ladefehler}`);
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
    await expect
      .poll(() => page.locator(".tiptap-editor img").evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    expect(aborted).toBe(2);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    expect((await auditEditor(page)).violations).toEqual([]);
  });

  test("Red Team: fremde Pfade, manipulierte Abschnitts-IDs und fremde Projekte", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/projektuebersicht/${projectId}`);
    const token = accessToken(await page.context().cookies());
    const conn = { supabaseUrl, anonKey };
    const patch = (body: unknown) => restRequest(conn, `chapters?id=eq.${ch.angriff}`, { method: "PATCH", body: JSON.stringify(body) }, token);

    // Ein Mitglied trägt per REST einen fremden Pfad ein und entfernt ihn wieder.
    const foreign = `${readOnlyProject}/${ch.lesen}/fremd.png`;
    expect((await patch({ image_sections: { ...placed({}), start: { layout: "1-spaltig", images: [{ id: "x", storage_path: foreign }] } } })).status).toBeLessThan(300);
    expect((await patch({ image_sections: placed({}) })).status).toBeLessThan(300);
    const { count } = await admin.from(QUEUE).select("*", { count: "exact", head: true }).eq("storage_path", foreign);
    expect(count).toBe(0);

    // Eine Abschnitts-ID mit HTML wird beim Öffnen verworfen und nie ausgeführt.
    const evil = '"><img src=x onerror=window.__pwned=1>';
    expect((await patch({ body: doc(para("Ziel"), { type: "imageSection", attrs: { sectionId: evil } }, para("Ende")), image_sections: placed({}) })).status).toBeLessThan(300);
    await open(page, "angriff");
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(sections(page)).toHaveCount(0);
    expect(await blocks(page)).toEqual(["Ziel", "Ende"]);

    // Bilder eines anderen Projekts lassen sich nicht signieren.
    const other = await admin.from("projects").select("id").neq("id", projectId).neq("id", readOnlyProject).limit(1).maybeSingle();
    if (other.data) {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/chapter-heroes/${other.data.id}/x/y.png`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  test("AC-11, AC-36, AC-40: Lesemodus, Druckansicht, Phone-Hinweis und Tablet", async ({ page, browser }) => {
    test.setTimeout(150_000);
    await open(page, "lesen", readOnlyProject);
    await expect(page.locator(".tiptap-editor img")).toHaveCount(1);
    await page.locator(".tiptap-editor [data-paginate-row]").first().hover();
    await expect(page.getByLabel("Bild löschen")).toHaveCount(0);
    await expect(page.getByLabel("2 Bilder nebeneinander")).toHaveCount(0);
    await expect(tool(page)).toBeDisabled();
    await page.locator(".tiptap-editor p", { hasText: "Ende" }).click({ position: { x: 1, y: 4 } });
    await page.keyboard.press("Backspace");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(sections(page)).toHaveCount(1);

    await open(page, "druck");
    await page.emulateMedia({ media: "print" });
    const print = await page.evaluate(() => ({
      chrome: Array.from(document.querySelectorAll(".a5-stack .editor-chrome")).filter((el) => getComputedStyle(el).display !== "none").length,
      trailing: Array.from(document.querySelectorAll(".a5-trailing-line")).map((el) => getComputedStyle(el).display),
      images: document.querySelectorAll(".tiptap-editor img").length,
    }));
    await page.emulateMedia({ media: "screen" });
    expect(print).toEqual({ chrome: 0, trailing: ["none"], images: 2 });

    const phone = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const p = await phone.newPage();
    await p.goto(`/projektuebersicht/${projectId}/kapiteleditor/${ch.druck}`);
    await expect(p.getByText("Editor auf dem Smartphone nicht verfügbar")).toBeVisible({ timeout: 20_000 });
    expect(await p.locator(".tiptap-editor").isVisible()).toBe(false);
    await phone.close();

    const tablet = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 768, height: 1024 }, hasTouch: true });
    const t = await tablet.newPage();
    await t.goto(`/projektuebersicht/${projectId}/kapiteleditor/${ch.druck}`);
    await t.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
    await t.waitForTimeout(500);
    await expect(tool(t)).toBeVisible();
    await t.locator(".tiptap-editor img").first().tap();
    await expect
      .poll(() => t.getByLabel("2 Bilder nebeneinander").first().evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).opacity))
      .toBe("1");
    await tablet.close();
  });
});
