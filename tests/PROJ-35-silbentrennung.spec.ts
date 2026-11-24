import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStage, createTestAccount, readEnvLocal, signIn, type TestAccount } from "./helpers/stage";
import { countWordsFromBody } from "../src/lib/kapiteleditor/countWords";

// PROJ-35: Automatische Silbentrennung als Anzeige, Buchregeln, Seitenregeln.
// Eigene temporäre Konten und Daten auf Stage, die echte Cron-Route wird nie aufgerufen.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-35-silbentrennung.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj35-${RUN_ID}.json`);
const SHY = "­";
const NBSP = " ";

const PROSE = [
  "Meine Großmutter erzählte uns Kindern an langen Winterabenden von der Nachkriegszeit, von Lebensmittelmarken, Kartoffelschalensuppe und den Schwierigkeiten der Wohnungszuweisung im zerstörten Stadtzentrum.",
  "Die Eisenbahnverbindung zwischen unserem Heimatdorf und der Kreisstadt war damals die wichtigste Verkehrsverbindung, und die Bahnhofsvorsteherin kannte jeden Fahrgast persönlich beim Namen.",
  "Später arbeitete mein Vater als Versicherungskaufmann in einer Generalvertretung, während meine Mutter die Buchhaltung des Familienunternehmens übernahm und nebenbei Klavierunterricht gab.",
];
// Lange Zusammensetzungen erzwingen viele getrennte Zeilen in Folge (AC-8).
const COMPOUNDS =
  "Versicherungskaufmannsgehilfenausbildung Eisenbahnverbindungsstreckenabschnitt Lebensmittelmarkenausgabestellenleitung Kartoffelschalensuppenrezeptsammlung Bahnhofsvorsteherinnenvereinigung Familienunternehmensbuchhaltungsabteilung Klavierunterrichtsstundenplanung Nachkriegswohnungszuweisungsbescheid Generalvertretungsleitungssitzung";

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
const ch = { buch: crypto.randomUUID(), alt: crypto.randomUUID(), getippt: crypto.randomUUID() };

type Block = Record<string, unknown>;
const para = (text: string, attrs?: Record<string, unknown>): Block => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text }],
});

async function open(page: Page, id: string) {
  await page.goto(`/projektuebersicht/${projectId}/kapiteleditor/${id}`);
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
}

/** Zeilenanfänge aller Absätze (Absatz:Textversatz) und die Seitenzahl. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const starts: string[] = [];
    document.querySelectorAll(".tiptap-editor p").forEach((p, pi) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let lastTop: number | null = null;
      let offset = 0;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = n.textContent ?? "";
        if (t === "­") continue;
        for (let i = 0; i < t.length; i += 1, offset += 1) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const rects = r.getClientRects();
          const rect = rects[rects.length - 1];
          if (!rect || (rect.width === 0 && rect.height === 0)) continue;
          if (lastTop === null || rect.top > lastTop + 4) starts.push(`${pi}:${offset}`);
          lastTop = rect.top;
        }
      }
    });
    return { starts, pages: document.querySelectorAll(".a5-page-frame").length };
  });

/** Sichtbare Trennstriche, Trennungen am Seitenende und längste Folge getrennter Zeilen. */
const rules = (page: Page) =>
  page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll(".a5-page-frame")).map((f) => f.getBoundingClientRect());
    const frameOf = (y: number) => frames.findIndex((f) => y >= f.top - 1 && y <= f.bottom + 1);
    const editor = document.querySelector(".tiptap-editor")!;
    const visible = Array.from(editor.querySelectorAll<HTMLElement>(".a5-shy")).filter(
      (el) => el.getBoundingClientRect().width > 0.5,
    );
    let pageEnd = 0;
    for (const el of visible) {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      walker.currentNode = el.firstChild ?? el;
      let next = walker.nextNode();
      while (next && !(next.textContent ?? "").trim()) next = walker.nextNode();
      if (!next) continue;
      const range = document.createRange();
      range.setStart(next, 0);
      range.setEnd(next, 1);
      if (frameOf(range.getBoundingClientRect().top) !== frameOf(el.getBoundingClientRect().top)) pageEnd += 1;
    }
    let longest = 0;
    const centered: number[] = [];
    editor.querySelectorAll("p").forEach((p) => {
      const mine = visible.filter((el) => p.contains(el));
      if (getComputedStyle(p).textAlign === "center" || getComputedStyle(p).textAlign === "right") {
        centered.push(mine.length);
      }
      if (mine.length === 0) return;
      const range = document.createRange();
      range.selectNodeContents(p);
      const tops: number[] = [];
      for (const rect of Array.from(range.getClientRects()).sort((a, b) => a.top - b.top)) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (!tops.length || Math.abs(tops[tops.length - 1] - rect.top) >= 2) tops.push(rect.top);
      }
      const lines = mine
        .map((el) => {
          const top = el.getBoundingClientRect().top;
          return tops.reduce((best, t, i) => (Math.abs(t - top) < Math.abs(tops[best] - top) ? i : best), 0);
        })
        .sort((a, b) => a - b);
      let run = 0;
      lines.forEach((line, i) => {
        run = i > 0 && line === lines[i - 1] + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
      });
    });
    return { visible: visible.length, pageEnd, longest, centeredHyphens: centered.reduce((a, b) => a + b, 0) };
  });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const env = readEnvLocal();
  assertStage(env);
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  account = await createTestAccount(admin, { email: `e2e-proj35-${RUN_ID}@example.test`, name: "Test Silben" });
  const { data: project, error } = await admin
    .from("projects")
    .insert({ title: "Silbentrennung", owner_id: account.id })
    .select("id")
    .single();
  if (error || !project) throw new Error(error?.message ?? "Projekt fehlt");
  projectId = project.id as string;
  await admin.from("project_access").insert({ project_id: projectId, expires_at: "2028-06-15T12:00:00Z" });
  await admin.from("project_members").insert({ project_id: projectId, user_id: account.id, role: "projektleiter" });

  const buch = [
    ...Array.from({ length: 10 }, (_, i) => para(PROSE[i % 3])),
    para(PROSE[1], { textAlign: "center" }),
    para(PROSE[2], { textAlign: "right" }),
    para(`${COMPOUNDS} ${COMPOUNDS} ${COMPOUNDS} Ende.`),
    { type: "blockquote", content: [para(`${COMPOUNDS} ${COMPOUNDS} Ende.`)] },
    { type: "bulletList", content: [{ type: "listItem", content: [para(PROSE[0])] }] },
    ...Array.from({ length: 12 }, (_, i) => para(PROSE[i % 3])),
  ];
  // Ein Kapitel aus der Zeit vor PROJ-35: Trennzeichen stehen im gespeicherten Text.
  const old = (t: string) => t.replace("Großmutter", `Groß${SHY}mut${SHY}ter`).replace("Winterabenden", `Win${SHY}ter${SHY}aben${SHY}den`);
  const rows = [
    { id: ch.buch, body: { type: "doc", content: buch } },
    { id: ch.alt, body: { type: "doc", content: [para(old(PROSE[0])), para(PROSE[1])] } },
    { id: ch.getippt, body: { type: "doc", content: [{ type: "paragraph" }] } },
  ];
  const { error: chapterError } = await admin.from("chapters").insert(
    rows.map((row, index) => ({
      ...row,
      project_id: projectId,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      chapter_origin: "custom",
      word_count: 100,
      page_count: 1,
    })) as never,
  );
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
    await admin.from("projects").delete().eq("id", projectId);
    await admin.from("trash_chapters").delete().eq("project_id", projectId);
    await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
    await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
  }
  if (account) await admin.auth.admin.deleteUser(account.id);
});

test.describe("PROJ-35 — Silbentrennung", () => {
  test.use({ storageState: SESSION_FILE });

  test("AC-2, AC-8, AC-9, AC-14 bis AC-16: Buchregeln im langen Kapitel, neu geöffnet gleich", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, ch.buch);
    const first = await rules(page);
    expect(first.visible, "Es wird getrennt").toBeGreaterThan(20);
    expect(first.pageEnd, "Keine Seite endet mit einem Trennstrich").toBe(0);
    expect(first.longest, "Höchstens 3 getrennte Zeilen in Folge").toBeLessThanOrEqual(3);
    expect(first.centeredHyphens, "Zentriert und rechtsbündig wird nicht getrennt").toBe(0);
    await expect(page.locator(".tiptap-editor .a5-shy").first()).toBeAttached();
    // Kapiteltitel werden nie getrennt.
    await expect(page.locator(".a5-stack").locator("h1, h2").first()).toHaveCSS("hyphens", "none");
    const before = await layout(page);
    expect(before.pages).toBeGreaterThan(3);

    await open(page, ch.buch);
    expect(await layout(page)).toEqual(before);
    expect(await rules(page)).toEqual(first);

    // Druckansicht: dieselben Umbrüche (AC-4).
    await page.emulateMedia({ media: "print" });
    const printed = await layout(page);
    await page.emulateMedia({ media: "screen" });
    expect(printed.starts).toEqual(before.starts);
  });

  test("AC-9 beim Tippen: auch nach vielen Eingaben endet keine Seite mit einem Trennstrich", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, ch.buch);
    await page.locator(".tiptap-editor p").nth(2).click({ position: { x: 60, y: 4 } });
    await page.waitForTimeout(200);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.type("Lebensmittelmarkenausgabe und Kartoffelernte ");
      await page.waitForTimeout(300);
      const now = await rules(page);
      expect(now.pageEnd, `Eingabe ${i + 1}`).toBe(0);
      expect(now.longest, `Eingabe ${i + 1}`).toBeLessThanOrEqual(3);
    }
  });

  test("AC-1, AC-18 bis AC-22: Getippt wie geladen, Cursor ohne Stopps, Text und Kopie sauber", async ({ page, context }) => {
    test.setTimeout(150_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Alte Trennzeichen fallen beim Öffnen weg, ohne zu speichern (AC-20).
    await open(page, ch.alt);
    expect(
      await page.evaluate(() => (document.querySelector(".tiptap-editor") as unknown as { editor: { state: { doc: { textContent: string } } } }).editor.state.doc.textContent),
    ).not.toContain(SHY);
    const { data: untouched } = await admin.from("chapters").select("body").eq("id", ch.alt).single();
    expect(JSON.stringify(untouched!.body)).toContain(SHY);
    const loaded = await layout(page);

    // Cursor: 16 Pfeile stehen hinter „Meine Großmutter", 4 Rücktasten löschen 4 Zeichen (AC-18).
    const first = page.locator(".tiptap-editor p").first();
    const text = () => first.evaluate((el) => (el.textContent ?? "").replaceAll("­", ""));
    await first.click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(150);
    for (let i = 0; i < 16; i += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.type("X");
    expect((await text()).startsWith("Meine GroßmutterX")).toBe(true);
    await page.keyboard.press("Backspace");
    const full = await text();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("Backspace");
    expect(full.length - (await text()).length).toBe(4);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(text).toBe(full);

    // Kopieren direkt nach dem Markieren (AC-21).
    await first.click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(150);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("ControlOrMeta+c");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.length).toBeGreaterThan(40);
    expect(copied).not.toContain(SHY);

    // Getippter Text wird genauso getrennt und umbrochen wie geladener (AC-1).
    await open(page, ch.getippt);
    await page.locator(".tiptap-editor p").first().click();
    await page.keyboard.type(PROSE[0]);
    await page.keyboard.press("Enter");
    await page.keyboard.type(PROSE[1]);
    await page.waitForTimeout(500);
    expect(await layout(page)).toEqual(loaded);
    await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 20_000 });

    // Gespeicherter Text ohne Trennzeichen und ohne geschützte Leerzeichen, Wortzahl stimmt (AC-20, AC-22).
    const expectedWords = countWordsFromBody({ type: "doc", content: [para(PROSE[0]), para(PROSE[1])] });
    await expect
      .poll(async () => (await admin.from("chapters").select("word_count").eq("id", ch.getippt).single()).data?.word_count)
      .toBe(expectedWords);
    const { data: saved } = await admin.from("chapters").select("body").eq("id", ch.getippt).single();
    const json = JSON.stringify(saved!.body);
    expect(json).not.toContain(SHY);
    expect(json).not.toContain(NBSP);
    expect(json).toContain(PROSE[0]);
  });
});
