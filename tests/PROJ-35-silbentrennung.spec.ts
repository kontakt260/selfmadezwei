import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
let readOnlyProject = "";
let supabaseUrl = "";
let anonKey = "";
const ch = {
  buch: crypto.randomUUID(),
  alt: crypto.randomUUID(),
  getippt: crypto.randomUUID(),
  bilder: crypto.randomUUID(),
  einfuegen: crypto.randomUUID(),
  wechsel: crypto.randomUUID(),
  angriff: crypto.randomUUID(),
  lesen: crypto.randomUUID(),
};

type Block = Record<string, unknown>;
const para = (text: string, attrs?: Record<string, unknown>): Block => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text }],
});

async function open(page: Page, id: string, project = projectId) {
  await page.goto(`/projektuebersicht/${project}/kapiteleditor/${id}`);
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
}

const docText = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector(".tiptap-editor") as unknown as { editor: { state: { doc: { textContent: string } } } }).editor
        .state.doc.textContent,
  );

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
  supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
  // Projekt im Lesemodus (Zugang abgelaufen) mit demselben Buchtext.
  const { data: expired } = await admin
    .from("projects")
    .insert({ title: "Silbentrennung Lesemodus", owner_id: account.id })
    .select("id")
    .single();
  readOnlyProject = expired!.id as string;
  await admin.from("project_access").insert({ project_id: readOnlyProject, expires_at: new Date(Date.now() - 5 * 86_400_000).toISOString() });
  await admin.from("project_members").insert({ project_id: readOnlyProject, user_id: account.id, role: "projektleiter" });

  // Fotos liegen wie im echten Upload im Ordner ihres Kapitels.
  const photo = async () => {
    const id = crypto.randomUUID();
    const storage_path = `${projectId}/${ch.bilder}/${id}.png`;
    const { error: uploadError } = await admin.storage
      .from("chapter-heroes")
      .upload(storage_path, solidPng(900, 600, [150, 184, 151]), { contentType: "image/png" });
    if (uploadError) throw new Error(uploadError.message);
    return { id, storage_path, signed_url: "", alt: "" };
  };
  const [s1, s2] = [crypto.randomUUID(), crypto.randomUUID()];
  const empty = { layout: "1-spaltig", images: [] };
  const bilder = [
    ...buch.slice(0, 6),
    { type: "imageSection", attrs: { sectionId: s1 } },
    ...buch.slice(6, 14),
    { type: "pageBreak" },
    para(PROSE[0]),
    { type: "imageSection", attrs: { sectionId: s2 } },
    ...buch.slice(14),
    para("Ende."),
  ];
  const bilderSections = {
    start: empty,
    end: empty,
    inline: {
      [s1]: { layout: "1-spaltig", images: [await photo()] },
      [s2]: { layout: "2-spaltig", images: [await photo(), await photo()] },
    },
    placed: true,
  };

  // Ein Kapitel aus der Zeit vor PROJ-35: Trennzeichen stehen im gespeicherten Text.
  const old = (t: string) => t.replace("Großmutter", `Groß${SHY}mut${SHY}ter`).replace("Winterabenden", `Win${SHY}ter${SHY}aben${SHY}den`);
  const rows: Array<{ id: string; body: unknown; image_sections?: unknown; project?: string }> = [
    { id: ch.buch, body: { type: "doc", content: buch } },
    { id: ch.alt, body: { type: "doc", content: [para(old(PROSE[0])), para(PROSE[1])] } },
    { id: ch.getippt, body: { type: "doc", content: [{ type: "paragraph" }] } },
    { id: ch.bilder, body: { type: "doc", content: bilder }, image_sections: bilderSections },
    { id: ch.einfuegen, body: { type: "doc", content: [{ type: "paragraph" }] } },
    { id: ch.wechsel, body: { type: "doc", content: [para(PROSE[0]), para(PROSE[1])] } },
    { id: ch.angriff, body: { type: "doc", content: [para(PROSE[0])] } },
    { id: ch.lesen, body: { type: "doc", content: buch }, project: readOnlyProject },
  ];
  const { error: chapterError } = await admin.from("chapters").insert(
    rows.map((row, index) => ({
      id: row.id,
      body: row.body,
      project_id: row.project ?? projectId,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      chapter_origin: "custom",
      word_count: 100,
      page_count: 1,
      image_sections: row.image_sections ?? { start: empty, end: empty },
    })) as never,
    { defaultToNull: false },
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
    const { data: files } = await admin.storage.from("chapter-heroes").list(`${projectId}/${ch.bilder}`);
    if (files?.length) {
      await admin.storage.from("chapter-heroes").remove(files.map((file) => `${projectId}/${ch.bilder}/${file.name}`));
    }
    await admin.from("storage_image_cleanup_queue").delete().eq("project_id", projectId);
  }
  for (const id of [projectId, readOnlyProject].filter(Boolean)) {
    await admin.from("projects").delete().eq("id", id);
    await admin.from("trash_chapters").delete().eq("project_id", id);
    await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", id);
    await admin.from("storage_cleanup_queue").delete().eq("project_id", id);
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

  test("AC-4, AC-14, AC-23: Lesemodus gleich, Listen und Zitate getrennt, Seitenzahl passt", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, ch.buch);
    const editor = await layout(page);
    const kinds = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll<HTMLElement>(".tiptap-editor .a5-shy")).filter(
        (el) => el.getBoundingClientRect().width > 0.5,
      );
      return {
        list: visible.filter((el) => el.closest("li")).length,
        quote: visible.filter((el) => el.closest("blockquote")).length,
      };
    });
    expect(kinds.list).toBeGreaterThan(0);
    expect(kinds.quote).toBeGreaterThan(0);

    await open(page, ch.lesen, readOnlyProject);
    expect(await layout(page)).toEqual(editor);

    await open(page, ch.bilder);
    const withImages = await rules(page);
    expect(withImages.pageEnd).toBe(0);
    expect(withImages.longest).toBeLessThanOrEqual(3);
    const first = await layout(page);
    await open(page, ch.bilder);
    expect(await layout(page)).toEqual(first);
    await page.locator(".tiptap-editor p").nth(2).click({ position: { x: 40, y: 4 } });
    await page.keyboard.type(" Nachtrag");
    await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 20_000 });
    const frames = await page.locator(".a5-page-frame").count();
    await expect
      .poll(async () => (await admin.from("chapters").select("page_count").eq("id", ch.bilder).single()).data?.page_count, {
        timeout: 15_000,
      })
      .toBe(frames);
  });

  test("AC-1, AC-15, AC-17, AC-19, AC-21: Einfügen, Ausrichtung, kein Schalter, Doppelklick, Entf, Ausschneiden", async ({ page, context }) => {
    test.setTimeout(150_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, ch.buch);
    const loaded = await layout(page);
    const firstThree = (l: { starts: string[] }) => l.starts.filter((s) => Number(s.split(":")[0]) < 3);

    // Eingefügt (mit fremden Trennzeichen) wird wie geladen getrennt.
    await open(page, ch.einfuegen);
    const html = PROSE.map((t) => `<p>${t.replace("Großmutter", `Groß${SHY}mutter`)}</p>`).join("");
    await page.evaluate((value) => {
      const el = document.querySelector(".tiptap-editor") as unknown as {
        editor: { view: { pasteHTML: (h: string) => void }; commands: { focus: (p: string) => void } };
      };
      el.editor.commands.focus("start");
      el.editor.view.pasteHTML(value);
    }, html);
    await page.waitForTimeout(600);
    expect(await docText(page)).not.toContain(SHY);
    expect(firstThree(await layout(page))).toEqual(firstThree(loaded));

    // Ausrichtung: zentriert und rechtsbündig ohne Trennung, Blocksatz wieder mit.
    await open(page, ch.wechsel);
    const p = page.locator(".tiptap-editor p").first();
    const visibleIn = () =>
      p.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>(".a5-shy")).filter((s) => s.getBoundingClientRect().width > 0.5).length);
    const start = await visibleIn();
    expect(start).toBeGreaterThan(0);
    await p.click({ position: { x: 20, y: 4 } });
    await page.getByLabel("Zentriert").click();
    await expect.poll(visibleIn).toBe(0);
    await page.getByLabel("Rechtsbündig").click();
    await expect.poll(visibleIn).toBe(0);
    await page.getByLabel("Blocksatz").click();
    await expect.poll(visibleIn).toBe(start);
    // Es gibt keinen Schalter für die Silbentrennung.
    await expect(page.getByRole("button", { name: /Trenn/i })).toHaveCount(0);

    // Doppelklick auf den ersten Teil eines getrennten Wortes markiert das ganze Wort.
    await open(page, ch.buch);
    const target = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(".tiptap-editor .a5-shy")).find(
        (s) => s.getBoundingClientRect().width > 0.5,
      )!;
      const r = el.getBoundingClientRect();
      return { x: r.left - 6, y: r.top + r.height / 2 };
    });
    await page.mouse.dblclick(target.x, target.y);
    await page.waitForTimeout(200);
    const selected = await page.evaluate(() => {
      const ed = (document.querySelector(".tiptap-editor") as unknown as {
        editor: { state: { selection: { from: number; to: number }; doc: { textBetween: (a: number, b: number) => string } } };
      }).editor;
      return ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to);
    });
    expect(selected).toMatch(/^\p{L}{6,}$/u);
    expect(PROSE.join(" ")).toContain(selected);

    // Entf löscht je Druck ein sichtbares Zeichen.
    const first = page.locator(".tiptap-editor p").first();
    await first.click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(150);
    for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
    const before = await docText(page);
    for (let i = 0; i < 5; i += 1) await page.keyboard.press("Delete");
    expect(before.length - (await docText(page)).length).toBe(5);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => docText(page)).toBe(before);

    // Ausschneiden: Zwischenablage sauber, Rückgängig stellt Text und Umbrüche her.
    const layoutBefore = await layout(page);
    await page.locator(".tiptap-editor p").nth(1).click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(150);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("ControlOrMeta+x");
    const cut = await page.evaluate(() => navigator.clipboard.readText());
    expect(cut.length).toBeGreaterThan(40);
    expect(cut).not.toContain(SHY);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => docText(page)).toBe(before);
    await page.waitForTimeout(400);
    expect(await layout(page)).toEqual(layoutBefore);
  });

  test("AC-5: Die Trennung erscheint mit dem Tastendruck, danach springt nichts", async ({ page }) => {
    await open(page, ch.wechsel);
    await page.locator(".tiptap-editor p").nth(1).click();
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await page.waitForTimeout(200);
    for (const word of [" Lebensmittelmarkenausgabe", " Kartoffelschalensuppe", " Bahnhofsvorsteherin"]) {
      await page.keyboard.type(word);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const soon = (await layout(page)).starts;
      await page.waitForTimeout(600);
      expect((await layout(page)).starts).toEqual(soon);
    }
  });

  test("Red Team: Trennzeichen und geschützte Leerzeichen per REST werden beim Öffnen und Speichern entfernt", async ({ page }) => {
    await page.goto(`/projektuebersicht/${projectId}`);
    const token = accessToken(await page.context().cookies());
    const res = await restRequest(
      { supabaseUrl, anonKey },
      `chapters?id=eq.${ch.angriff}`,
      { method: "PATCH", body: JSON.stringify({ body: { type: "doc", content: [para(`Groß${SHY}${SHY}mutter${SHY} erzählte${NBSP}viel ${SHY.repeat(500)}Ende`)] } }) },
      token,
    );
    expect(res.status).toBeLessThan(300);
    await open(page, ch.angriff);
    expect(await docText(page)).not.toContain(SHY);
    await page.locator(".tiptap-editor p").first().click();
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await page.keyboard.type(" x");
    await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 20_000 });
    const { data } = await admin.from("chapters").select("body").eq("id", ch.angriff).single();
    expect(JSON.stringify(data!.body)).not.toContain(SHY);
  });
});
