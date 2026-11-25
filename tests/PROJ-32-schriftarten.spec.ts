import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStage, createTestAccount, readEnvLocal, signIn, type TestAccount } from "./helpers/stage";

// PROJ-32: Buchschrift im Kapitel-Editor (Schritt 2: Auswahl, Wechsel, Seitenzahl je Schrift).
// Eigene temporäre Konten und Daten auf Stage, die echte Cron-Route wird nie aufgerufen.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-32-schriftarten.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj32-${RUN_ID}.json`);

const FONTS = ["pt-serif", "garamond", "baskerville", "pagella", "heros", "atkinson"] as const;
type FontId = (typeof FONTS)[number];
// Familienname, wie next/font ihn vergibt, enthält den Schriftnamen.
const FAMILY: Record<FontId, RegExp> = {
  "pt-serif": /PT.Serif/i,
  garamond: /Garamond/i,
  baskerville: /Baskervville/i,
  pagella: /pagella/i,
  heros: /heros/i,
  atkinson: /Atkinson/i,
};
const LABEL: Record<FontId, string> = {
  "pt-serif": "PT Serif",
  garamond: "Garamond",
  baskerville: "Baskerville",
  pagella: "Pagella",
  heros: "Heros",
  atkinson: "Atkinson",
};

const PROSE = [
  "Meine Großmutter erzählte uns Kindern an langen Winterabenden von der Nachkriegszeit, von Lebensmittelmarken, Kartoffelschalensuppe und den Schwierigkeiten der Wohnungszuweisung im zerstörten Stadtzentrum.",
  "Die Eisenbahnverbindung zwischen unserem Heimatdorf und der Kreisstadt war damals die wichtigste Verkehrsverbindung, und die Bahnhofsvorsteherin kannte jeden Fahrgast persönlich beim Namen.",
  "Später arbeitete mein Vater als Versicherungskaufmann in einer Generalvertretung, während meine Mutter die Buchhaltung des Familienunternehmens übernahm und nebenbei Klavierunterricht gab.",
];
const COMPOUNDS =
  "Versicherungskaufmannsgehilfenausbildung Eisenbahnverbindungsstreckenabschnitt Lebensmittelmarkenausgabestellenleitung Kartoffelschalensuppenrezeptsammlung Bahnhofsvorsteherinnenvereinigung";

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
let readOnlyProject = "";
// Projekte aus einzelnen Tests (Neusatz), werden im afterAll mit gelöscht.
const extraProjects: string[] = [];
const ch = {
  wechsel: crypto.randomUUID(),
  zweites: crypto.randomUUID(),
  lang: crypto.randomUUID(),
  andere: crypto.randomUUID(),
  laden: crypto.randomUUID(),
  lesen: crypto.randomUUID(),
};

type Block = Record<string, unknown>;
const para = (text: string, attrs?: Record<string, unknown>): Block => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text }],
});
const marked = (text: string, mark: string): Block => ({
  type: "paragraph",
  content: [{ type: "text", text, marks: [{ type: mark }] }],
});

async function open(page: Page, id: string, project = projectId) {
  await page.goto(`/projektuebersicht/${project}/kapiteleditor/${id}`);
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
}

async function setBookFont(project: string, font: FontId) {
  const { error } = await admin.from("projects").update({ book_font: font }).eq("id", project);
  if (error) throw new Error(error.message);
}

async function chapterRow(id: string) {
  const { data } = await admin.from("chapters").select("page_count, page_count_font, body").eq("id", id).single();
  return data as { page_count: number; page_count_font: string | null; body: unknown };
}

const fontOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily);

/** Zeilenanfänge aller Absätze und die Seitenzahl. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const starts: string[] = [];
    document.querySelectorAll("main .tiptap-editor p").forEach((p, pi) => {
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

/** Seitenregeln aus PROJ-35 und Ränder: Trennstrich am Seitenende, längste Folge, Text über den Rand. */
const rules = (page: Page) =>
  page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll(".a5-page-frame")).map((f) => f.getBoundingClientRect());
    const frameOf = (y: number) => frames.findIndex((f) => y >= f.top - 1 && y <= f.bottom + 1);
    const editor = document.querySelector("main .tiptap-editor")!;
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
    editor.querySelectorAll("p").forEach((p) => {
      const mine = visible.filter((el) => p.contains(el));
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
    // Rechter Rand des Inhalts: Kein Text ragt darüber hinaus (AC-15).
    const fg = document.querySelector("main .a5-stack__fg") as HTMLElement;
    const right = fg.getBoundingClientRect().right - parseFloat(getComputedStyle(fg).paddingRight);
    let overflow = 0;
    document.querySelectorAll("main .a5-stack__fg h1, main .tiptap-editor p").forEach((block) => {
      const range = document.createRange();
      range.selectNodeContents(block);
      for (const rect of Array.from(range.getClientRects())) if (rect.right > right + 1) overflow += 1;
    });
    return { visible: visible.length, pageEnd, longest, overflow };
  });

/** Eigenes Projekt mit Kapiteln für die Neusatz-Tests. Alle Seitenzahlen stehen auf 1 und PT Serif. */
async function makeBook(title: string, bodies: Array<{ title: string; content: Block[]; sections?: unknown }>) {
  const { data, error } = await admin.from("projects").insert({ title, owner_id: account.id }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Projekt fehlt");
  const id = data.id as string;
  extraProjects.push(id);
  await admin.from("project_access").insert({ project_id: id, expires_at: "2028-06-15T12:00:00Z" });
  await admin.from("project_members").insert({ project_id: id, user_id: account.id, role: "projektleiter" });
  const empty = { layout: "1-spaltig", images: [] };
  const ids = bodies.map(() => crypto.randomUUID());
  const { error: chapterError } = await admin.from("chapters").insert(
    bodies.map((body, index) => ({
      id: ids[index],
      project_id: id,
      title: body.title,
      body: { type: "doc", content: body.content },
      sort_order: index,
      chapter_origin: "custom",
      word_count: 100,
      page_count: 1,
      image_sections: body.sections ?? { start: empty, end: empty },
    })) as never,
    { defaultToNull: false },
  );
  if (chapterError) throw new Error(chapterError.message);
  return { id, chapterIds: ids };
}

async function bookRows(project: string) {
  const { data } = await admin
    .from("chapters")
    .select("id, page_count, page_count_font, start_page, sort_order")
    .eq("project_id", project)
    .order("sort_order");
  return (data ?? []) as Array<{ id: string; page_count: number; page_count_font: string | null; start_page: number }>;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const env = readEnvLocal();
  assertStage(env);
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  account = await createTestAccount(admin, { email: `e2e-proj32-${RUN_ID}@example.test`, name: "Test Schrift" });

  const makeProject = async (title: string, expiresAt: string) => {
    const { data, error } = await admin.from("projects").insert({ title, owner_id: account.id }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Projekt fehlt");
    await admin.from("project_access").insert({ project_id: data.id, expires_at: expiresAt });
    await admin.from("project_members").insert({ project_id: data.id, user_id: account.id, role: "projektleiter" });
    return data.id as string;
  };
  projectId = await makeProject("Schriften", "2028-06-15T12:00:00Z");
  readOnlyProject = await makeProject(
    "Schriften Lesemodus",
    new Date(Date.now() - 5 * 86_400_000).toISOString(),
  );

  const kurz = [
    para(PROSE[0]),
    marked("Ein kursiver Satz über die Ernte im Herbst.", "italic"),
    marked("Ein fetter Satz über den langen Winter.", "bold"),
    { type: "blockquote", content: [para("„Wir hatten wenig, aber wir hatten einander“, sagte sie – und lachte.")] },
    para(PROSE[1]),
    para(PROSE[2]),
  ];
  const lang = [
    ...Array.from({ length: 10 }, (_, i) => para(PROSE[i % 3])),
    para(`${COMPOUNDS} ${COMPOUNDS} ${COMPOUNDS} Ende.`),
    { type: "blockquote", content: [para(`${COMPOUNDS} ${COMPOUNDS} Ende.`)] },
    { type: "pageBreak" },
    ...Array.from({ length: 14 }, (_, i) => para(PROSE[i % 3])),
  ];
  const empty = { layout: "1-spaltig", images: [] };
  const rows: Array<{ id: string; title: string; body: unknown; project?: string }> = [
    { id: ch.wechsel, title: "Kindheit", body: { type: "doc", content: [...kurz, ...kurz, ...kurz] } },
    { id: ch.zweites, title: "Jugend", body: { type: "doc", content: kurz } },
    {
      id: ch.lang,
      title: "Donaudampfschifffahrtsgesellschaftskapitänswitwenerinnerungen",
      body: { type: "doc", content: lang },
    },
    { id: ch.andere, title: "Zweite Person", body: { type: "doc", content: kurz } },
    { id: ch.laden, title: "Ohne Schrift", body: { type: "doc", content: kurz } },
    { id: ch.lesen, title: "Lesemodus", body: { type: "doc", content: kurz }, project: readOnlyProject },
  ];
  const { error: chapterError } = await admin.from("chapters").insert(
    rows.map((row, index) => ({
      id: row.id,
      body: row.body,
      project_id: row.project ?? projectId,
      title: row.title,
      sort_order: index,
      chapter_origin: "custom",
      word_count: 100,
      page_count: 1,
      image_sections: { start: empty, end: empty },
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
  for (const id of [projectId, readOnlyProject, ...extraProjects].filter(Boolean)) {
    await admin.from("projects").delete().eq("id", id);
    await admin.from("trash_chapters").delete().eq("project_id", id);
    await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", id);
    await admin.from("storage_cleanup_queue").delete().eq("project_id", id);
  }
  if (account) await admin.auth.admin.deleteUser(account.id);
});

test.describe("PROJ-32 — Buchschrift", () => {
  test.use({ storageState: SESSION_FILE });

  test("AC-1 bis AC-3: Vorgabe PT Serif wie bisher, Auswahl mit sechs Schriften in sich selbst", async ({ page }) => {
    await open(page, ch.wechsel);
    const stack = page.locator("main .a5-stack");
    await expect(stack).toHaveAttribute("data-book-font", "pt-serif");
    // Ohne Variablen gilt das bisherige Bild: Text PT Serif, Titel Merriweather.
    expect(await stack.evaluate((el) => el.style.getPropertyValue("--book-font"))).toBe("");
    expect(await fontOf(page, "main .tiptap-editor p")).toMatch(FAMILY["pt-serif"]);
    expect(await fontOf(page, "main .a5-stack__fg h1")).toMatch(/Merriweather/i);
    expect(await stack.evaluate((el) => getComputedStyle(el).fontSize)).toBe("14.6667px");

    const trigger = page.getByTestId("book-font-select");
    await expect(trigger).toHaveText("PT Serif");
    await expect(trigger).toHaveAttribute("aria-label", /ganze Buch/);
    await expect(trigger).toHaveAttribute("title", /ganze Buch/);

    await trigger.click();
    const options = page.getByRole("option");
    await expect(options).toHaveCount(6);
    for (const [index, font] of FONTS.entries()) {
      const option = options.nth(index);
      await expect(option).toContainText(LABEL[font]);
      const name = option.getByText(LABEL[font], { exact: true });
      expect(await name.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
        FAMILY[font],
      );
    }
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
  });

  test("AC-5: Abbrechen ändert nichts", async ({ page }) => {
    await open(page, ch.wechsel);
    await page.getByTestId("book-font-select").click();
    await page.getByRole("option", { name: /Garamond/ }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Schrift für das ganze Buch ändern?");
    await expect(dialog).toContainText("Alle Kapitel und die Seitenzahlen passen sich an.");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "pt-serif");
    await expect(page.getByTestId("book-font-select")).toHaveText("PT Serif");
    const { data } = await admin.from("projects").select("book_font").eq("id", projectId).single();
    expect(data?.book_font).toBe("pt-serif");
  });

  test("AC-6, AC-8, AC-9, AC-19: Wechsel sofort sichtbar, Titel und Seitenzahl folgen, bleibt nach Neuladen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, ch.wechsel);
    // Seitenzahl nach dem Öffnen mit PT Serif gespeichert (editorReady nach rund 5 s).
    await expect.poll(async () => (await chapterRow(ch.wechsel)).page_count_font ?? "leer", { timeout: 20_000 }).toMatch(
      /pt-serif|leer/,
    );
    const before = await layout(page);

    await page.getByTestId("book-font-select").click();
    await page.getByRole("option", { name: /Garamond/ }).click();
    const started = Date.now();
    await page.getByRole("alertdialog").getByRole("button", { name: "Schrift ändern" }).click();
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "garamond", { timeout: 5_000 });
    await expect.poll(() => fontOf(page, "main .tiptap-editor p"), { timeout: 5_000 }).toMatch(FAMILY.garamond);
    const switchMs = Date.now() - started;
    console.log(`Wechsel sichtbar nach ${switchMs} ms`);
    expect(switchMs, "AC-19: höchstens 1 Sekunde").toBeLessThan(1000);

    // Titel und Seitenzahl in der Buchschrift, keine Ersatzschrift.
    expect(await fontOf(page, "main .a5-stack__fg h1")).toMatch(FAMILY.garamond);
    expect(await fontOf(page, ".a5-page-number")).toMatch(FAMILY.garamond);
    const loaded = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => /Garamond/i.test(face.family) && !/Fallback/i.test(face.family))
        .map((face) => `${face.style} ${face.weight} ${face.status}`),
    );
    expect(loaded.filter((entry) => entry.endsWith("loaded")).length, `Schnitte: ${loaded.join(", ")}`).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("book-font-select")).toHaveText("Garamond");

    // Ruhe nach dem Wechsel: Nichts springt nach (AC-6).
    await page.waitForTimeout(600);
    const after = await layout(page);
    await page.waitForTimeout(1500);
    expect(await layout(page)).toEqual(after);
    expect(after.starts).not.toEqual(before.starts);
    const r = await rules(page);
    expect(r.pageEnd).toBe(0);
    expect(r.longest).toBeLessThanOrEqual(3);

    // Gespeichert am Projekt, Seitenzahl mit der neuen Schrift (auch wenn sie gleich bleibt).
    const { data } = await admin.from("projects").select("book_font").eq("id", projectId).single();
    expect(data?.book_font).toBe("garamond");
    await expect.poll(async () => (await chapterRow(ch.wechsel)).page_count_font, { timeout: 20_000 }).toBe("garamond");
    expect((await chapterRow(ch.wechsel)).page_count).toBe(after.pages);

    // „Rückgängig" im Text nimmt den Wechsel nicht zurück (AC-9).
    await page.locator("main .tiptap-editor p").first().click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "garamond");

    // Neu geöffnet: dieselbe Schrift, dieselben Zeilen (AC-9, AC-14).
    await open(page, ch.wechsel);
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "garamond");
    expect(await layout(page)).toEqual(after);
  });

  test("AC-7: Ein anderes Kapitel öffnet in der neuen Schrift und speichert seine Seitenzahl dazu", async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, ch.zweites);
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "garamond");
    expect(await fontOf(page, "main .tiptap-editor p")).toMatch(FAMILY.garamond);
    await expect.poll(async () => (await chapterRow(ch.zweites)).page_count_font, { timeout: 20_000 }).toBe("garamond");
  });

  test("AC-12, AC-14, AC-15: Seitenregeln und Ränder mit jeder Schrift, langer Titel bricht um", async ({ page }) => {
    test.setTimeout(240_000);
    const pages: Record<string, number> = {};
    for (const font of FONTS) {
      await setBookFont(projectId, font);
      await open(page, ch.lang);
      await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", font);
      expect(await fontOf(page, "main .tiptap-editor p")).toMatch(FAMILY[font]);
      // Der Name im Auswahlfeld ist nicht abgeschnitten.
      const clipped = await page.getByTestId("book-font-select").evaluate((el) => {
        const value = el.querySelector(":scope > span") as HTMLElement;
        return value.scrollWidth - value.clientWidth;
      });
      expect(clipped, `${font}: Name im Auswahlfeld vollständig`).toBeLessThanOrEqual(0);
      const r = await rules(page);
      expect(r.visible, `${font}: es wird getrennt`).toBeGreaterThan(5);
      expect(r.pageEnd, `${font}: kein Trennstrich am Seitenende`).toBe(0);
      expect(r.longest, `${font}: höchstens 3 in Folge`).toBeLessThanOrEqual(3);
      expect(r.overflow, `${font}: kein Text über den Rand`).toBe(0);
      const first = await layout(page);
      pages[font] = first.pages;
      await open(page, ch.lang);
      expect(await layout(page), `${font}: neu geöffnet identisch`).toEqual(first);
    }
    console.log(`Seiten je Schrift: ${JSON.stringify(pages)}`);
    // Gleiche x-Höhe: Die Schriften laufen ähnlich lang (höchstens ein Drittel Unterschied).
    const counts = Object.values(pages);
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(1.34);
    await setBookFont(projectId, "garamond");
  });

  test("AC-10: Im Lesemodus ist das Feld gesperrt und nennt den Grund, die Schrift wird angezeigt", async ({ page }) => {
    await setBookFont(readOnlyProject, "pagella");
    await open(page, ch.lesen, readOnlyProject);
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "pagella");
    expect(await fontOf(page, "main .tiptap-editor p")).toMatch(FAMILY.pagella);
    const trigger = page.getByTestId("book-font-select");
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveText("Pagella");
    await expect(trigger).toHaveAttribute("title", /abgelaufen/);
    await expect(trigger).toHaveAttribute("aria-label", /abgelaufen/);
  });

  test("AC-16: Wer noch mit der alten Schrift schreibt, speichert Text, aber keine Seitenzahl", async ({ page }) => {
    test.setTimeout(90_000);
    await setBookFont(projectId, "garamond");
    await open(page, ch.andere);
    // Erst wenn das Kapitel fertig gesetzt ist, schickt der Editor seine Seitenzahl mit (PROJ-30).
    await page.locator('main .a5-stack[data-ready="1"]').waitFor({ timeout: 15_000 });
    await expect.poll(async () => (await chapterRow(ch.andere)).page_count_font, { timeout: 20_000 }).toBe("garamond");
    // Jemand anderes stellt das Buch um, während das Kapitel hier offen ist.
    await setBookFont(projectId, "heros");
    await page.locator("main .tiptap-editor p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Nachtrag aus der alten Schrift.");
    await expect(page.getByText(/Die Buchschrift wurde inzwischen auf „Heros“ geändert/)).toBeVisible({ timeout: 15_000 });
    const row = await chapterRow(ch.andere);
    expect(JSON.stringify(row.body)).toContain("Nachtrag aus der alten Schrift.");
    expect(row.page_count_font).toBe("garamond");
    await setBookFont(projectId, "garamond");
  });

  test("AC-17: Scheitert das Speichern eines Wechsels, bleibt die alte Schrift und es erscheint eine Meldung", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setBookFont(projectId, "garamond");
    await open(page, ch.zweites);
    // Wie ohne Netz: Server-Aktionen kommen nicht an.
    await page.route("**/*", (route) =>
      route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue(),
    );
    await page.getByTestId("book-font-select").click();
    await page.getByRole("option", { name: /Heros/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Schrift ändern" }).click();
    await expect(page.getByText("Die Schrift konnte nicht geändert werden. Bitte versuchen Sie es erneut.")).toBeVisible();
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "garamond");
    expect(await fontOf(page, "main .tiptap-editor p")).toMatch(FAMILY.garamond);
    await expect(page.getByTestId("book-font-select")).toHaveText("Garamond");
    await expect(page.getByTestId("book-font-select")).toBeEnabled();
    await page.unroute("**/*");
    const { data } = await admin.from("projects").select("book_font").eq("id", projectId).single();
    expect(data?.book_font).toBe("garamond");
  });

  test("AC-18: Lädt die Schrift nicht, steht der Text in PT Serif mit Hinweis, ohne Seitenzahl", async ({ page }) => {
    test.setTimeout(60_000);
    await setBookFont(projectId, "baskerville");
    const before = await chapterRow(ch.laden);
    await page.route(/\/_next\/static\/media\/.*\.woff2$/, (route) => route.abort());
    await open(page, ch.laden);
    await expect(page.getByText(/Die Schrift „Baskerville“ konnte nicht geladen werden/)).toBeVisible();
    await expect(page.locator("main .a5-stack")).toHaveAttribute("data-book-font", "pt-serif");
    await expect(page.getByTestId("book-font-select")).toHaveText("Baskerville");
    await page.waitForTimeout(9_000);
    // Nichts wurde mit der falschen Schrift gemessen und gespeichert.
    const after = await chapterRow(ch.laden);
    expect(after.page_count_font).not.toBe("baskerville");
    expect(after.page_count_font).toBe(before.page_count_font);
    expect(after.page_count).toBe(before.page_count);
    await page.unroute(/\/_next\/static\/media\/.*\.woff2$/);
    await setBookFont(projectId, "garamond");
  });

  test("AC-20: Die Projektübersicht lädt nur die Schrift, die ihr Cover braucht", async ({ page }) => {
    test.setTimeout(90_000);
    const book = await makeBook("Ohne Buchschrift", [{ title: "Eins", content: [para(PROSE[0])] }]);
    const bookFaces = () =>
      page.evaluate(() =>
        Array.from(document.fonts)
          .filter((face) => /Garamond|Baskervville|Atkinson|pagella|heros/i.test(face.family))
          .filter((face) => !/Fallback/i.test(face.family))
          .filter((face) => face.status === "loaded" || face.status === "loading")
          .map((face) => face.family),
      );
    // Buch in PT Serif: keine Buchschrift.
    await page.goto(`/projektuebersicht/${book.id}`);
    await page.waitForLoadState("networkidle");
    expect(await bookFaces()).toEqual([]);

    // Buch in Pagella: nur Pagella, für Cover und Neusatz.
    await setBookFont(book.id, "pagella");
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    const faces = await bookFaces();
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((family) => /pagella/i.test(family)), faces.join(", ")).toBe(true);
  });

  test("AC-13: Nach dem Wechsel im Editor stimmen alle Seitenzahlen, ohne die Kapitel zu öffnen (Neusatz gleich Öffnen)", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const sectionId = crypto.randomUUID();
    const empty = { layout: "1-spaltig", images: [] };
    const fakePhoto = (n: number) => ({
      id: crypto.randomUUID(),
      storage_path: `00000000-0000-4000-8000-000000000000/x/${n}.png`,
      signed_url: "",
      alt: "",
    });
    const book = await makeBook("Neusatz", [
      { title: "Anfang", content: [para(PROSE[0]), para(PROSE[1])] },
      { title: "Lang", content: Array.from({ length: 24 }, (_, i) => para(PROSE[i % 3])) },
      {
        title: "Trennungen",
        content: [para(`${COMPOUNDS} ${COMPOUNDS} Ende.`), { type: "pageBreak" }, ...Array.from({ length: 9 }, (_, i) => para(PROSE[i % 3]))],
      },
      {
        title: "Mit Bildern",
        content: [
          ...Array.from({ length: 7 }, (_, i) => para(PROSE[i % 3])),
          { type: "imageSection", attrs: { sectionId } },
          ...Array.from({ length: 6 }, (_, i) => para(PROSE[i % 3])),
        ],
        sections: { start: empty, end: empty, inline: { [sectionId]: { layout: "2-spaltig", images: [fakePhoto(1), fakePhoto(2), fakePhoto(3)] } }, placed: true },
      },
      {
        title: "Gemischt",
        content: [
          para(PROSE[1], { textAlign: "center" }),
          { type: "blockquote", content: [para(PROSE[2])] },
          { type: "bulletList", content: [{ type: "listItem", content: [para(PROSE[0])] }] },
          ...Array.from({ length: 12 }, (_, i) => para(PROSE[(i + 1) % 3], { lineHeight: i % 2 ? "2" : null })),
        ],
      },
    ]);

    await open(page, book.chapterIds[0], book.id);
    await page.getByTestId("book-font-select").click();
    await page.getByRole("option", { name: /Pagella/ }).click();
    const started = Date.now();
    await page.getByRole("alertdialog").getByRole("button", { name: "Schrift ändern" }).click();
    // Die übrigen Kapitel bekommen ihre Seitenzahl, während das erste offen bleibt.
    await expect
      .poll(async () => (await bookRows(book.id)).slice(1).every((row) => row.page_count_font === "pagella"), {
        timeout: 60_000,
        intervals: [500],
      })
      .toBe(true);
    console.log(`Neusatz von 4 Kapiteln nach ${Date.now() - started} ms`);
    const rows = await bookRows(book.id);
    expect(rows.slice(1).some((row) => row.page_count > 1)).toBe(true);

    // Gleich wie beim Öffnen im Editor.
    for (const row of rows.slice(1)) {
      await open(page, row.id, book.id);
      await page.locator('.a5-stack[data-ready="1"]').waitFor({ timeout: 15_000 });
      const pages = await page.locator(".a5-page-frame").count();
      expect(pages, `Kapitel ${row.id}`).toBe(row.page_count);
    }
    // Startseiten folgen (PROJ-7-Trigger).
    const final = await bookRows(book.id);
    let start = 1;
    for (const row of final) {
      expect(row.start_page).toBe(start);
      start += row.page_count;
    }
  });

  test("AC-13: Die Projektübersicht zeigt den Hinweis und setzt die Kapitel neu", async ({ page }) => {
    test.setTimeout(120_000);
    const book = await makeBook("Übersicht", [
      { title: "Eins", content: Array.from({ length: 12 }, (_, i) => para(PROSE[i % 3])) },
      { title: "Zwei", content: Array.from({ length: 20 }, (_, i) => para(PROSE[i % 3])) },
      { title: "Drei", content: [para(PROSE[2])] },
    ]);
    // Ohne Hinweis, solange alles zur Schrift passt.
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByText(/Kapitel, .*Seiten? im A5-Format/)).toBeVisible();
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0);

    await setBookFont(book.id, "atkinson");
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByTestId("page-count-refresh")).toContainText("Seitenzahlen werden aktualisiert");
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0, { timeout: 60_000 });
    const rows = await bookRows(book.id);
    expect(rows.every((row) => row.page_count_font === "atkinson")).toBe(true);
    const total = rows.reduce((sum, row) => sum + row.page_count, 0);
    await expect(page.getByText(`3 Kapitel, ${total} Seiten im A5-Format`)).toBeVisible();
  });

  test("AC-23 bis AC-25: Das Cover steht in der Buchschrift, der Cover-Editor zeigt sie nur an", async ({ page }) => {
    test.setTimeout(90_000);
    const book = await makeBook("Cover in Garamond", [{ title: "Eins", content: [para(PROSE[0])] }]);
    await admin.from("project_covers").insert({
      project_id: book.id,
      theme: null,
      metadata: { subtitle: "Erinnerungen", author_line: "von Maria Müller", schema_version: 1 },
    });
    const cover = (root = page.locator("body")) => root.locator('[role="img"][aria-label^="Buchcover"]').first();
    const fontIn = (selector: string) =>
      cover()
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily);

    // Vorgabe PT Serif: Cover wie bisher.
    await page.goto(`/projektuebersicht/${book.id}`);
    expect(await fontIn("h2")).toMatch(/Merriweather/i);
    expect(await fontIn("p")).toMatch(FAMILY["pt-serif"]);

    // Nach dem Wechsel: Titel, Untertitel und Autorzeile in Garamond (AC-25: beim nächsten Öffnen).
    await setBookFont(book.id, "garamond");
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0, { timeout: 60_000 });
    expect(await fontIn("h2")).toMatch(FAMILY.garamond);
    for (const text of ["Erinnerungen", "von Maria Müller"]) {
      expect(await cover().getByText(text).evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(FAMILY.garamond);
    }
    // Die Garamond-Datei ist wirklich geladen, keine Ersatzschrift.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.fonts).some((face) => /Garamond/i.test(face.family) && !/Fallback/i.test(face.family) && face.status === "loaded"),
        ),
      )
      .toBe(true);

    // Startseite: Karte in Garamond.
    await page.goto("/");
    const card = page.locator('[role="img"][aria-label="Buchcover: Cover in Garamond, von Maria Müller"]');
    await expect(card).toBeVisible();
    expect(await card.locator("h2").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(FAMILY.garamond);

    // Cover-Editor: Vorschau in Garamond, Schrift nur angezeigt (AC-24).
    await page.goto(`/projektuebersicht/${book.id}/cover-bearbeiten`);
    await expect(page.getByTestId("cover-book-font")).toContainText("Garamond");
    await expect(page.getByTestId("cover-book-font")).toContainText("im Kapitel-Editor");
    await expect(page.getByTestId("book-font-select")).toHaveCount(0);
    expect(await fontIn("h2")).toMatch(FAMILY.garamond);
  });

  test("AC-13, Edge Case Hin und Her: volles Testbuch (40 Kapitel, rund 300 Seiten) in höchstens 60 Sekunden", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const chapters = Array.from({ length: 40 }, (_, n) => ({
      title: `Kapitel ${n + 1}`,
      content: Array.from({ length: 50 }, (_, i) => para(PROSE[(i + n) % 3])),
    }));
    const book = await makeBook("Volles Buch", chapters);
    await setBookFont(book.id, "garamond");

    const started = Date.now();
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByTestId("page-count-refresh")).toBeVisible();
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0, { timeout: 90_000 });
    const elapsed = Date.now() - started;
    const rows = await bookRows(book.id);
    const total = rows.reduce((sum, row) => sum + row.page_count, 0);
    console.log(`Volles Buch: ${rows.length} Kapitel, ${total} Seiten in Garamond nach ${elapsed} ms`);
    expect(rows.every((row) => row.page_count_font === "garamond")).toBe(true);
    expect(total).toBeGreaterThan(250);
    expect(elapsed, "AC-13: höchstens 60 Sekunden").toBeLessThan(60_000);

    // Schnell hin und her: Während des Neusatzes wird erneut gewechselt. Am Ende
    // passen alle Seitenzahlen zur zuletzt gewählten Schrift.
    await setBookFont(book.id, "heros");
    await page.goto(`/projektuebersicht/${book.id}`);
    await expect(page.getByTestId("page-count-refresh")).toContainText(/von 40 Kapiteln/, { timeout: 30_000 });
    await expect(page.getByTestId("page-count-refresh")).toContainText(/\(([3-9]|\d\d) von/, { timeout: 30_000 });
    await setBookFont(book.id, "baskerville");
    await expect(page.getByTestId("page-count-refresh")).toHaveCount(0, { timeout: 120_000 });
    const after = await bookRows(book.id);
    expect(after.every((row) => row.page_count_font === "baskerville")).toBe(true);
  });

  test("Tablet: Auswahlfeld erreichbar, Werkzeugleiste ohne seitliches Scrollen", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: SESSION_FILE,
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await open(page, ch.zweites);
    const trigger = page.getByTestId("book-font-select");
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 768).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
    await trigger.tap();
    await expect(page.getByRole("option")).toHaveCount(6);
    await page.screenshot({ path: path.join(os.tmpdir(), "proj32-tablet.png") });
    await context.close();
  });
});
