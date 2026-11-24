import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditEditor,
  caretInfo,
  doc,
  firstSoftBreakPosition,
  focusEditorAt,
  paragraph,
  prose,
  setEditorContent,
  waitForEditorReady,
  waitForSaved,
} from "./helpers/editor-audit";
import { solidPng, startMotion, stopMotion } from "./helpers/editor-bench";
import { assertStage, createTestAccount, readEnvLocal, signIn, type TestAccount } from "./helpers/stage";

// PROJ-25 AC-13: Prüfliste aller Editor-Abläufe, jeweils am Seitenanfang, am
// Seitenende und mitten im Kapitel. Nach jedem Schritt gelten dieselben Regeln:
// nichts ragt aus der Seite, der Cursor bleibt sichtbar, Bilder bewegen sich
// höchstens einmal, und es gibt keinen Fehler im Browser.
//   E2E_EDITOR=1 npx playwright test tests/PROJ-25-pruefliste.spec.ts --project=chromium
test.skip(process.env.E2E_EDITOR !== "1", "Nur mit E2E_EDITOR=1");
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj25-liste-${RUN_ID}.json`);
// PROJ-34: Die Fotos am Ende stehen als Bildabschnitt im Text, dahinter die
// leere Schreibzeile. Ohne den Abschnitt würde das Zurücksetzen ihn entfernen.
const BASE_DOC = doc(
  ...Array.from({ length: 14 }, (_, index) => paragraph(prose(6, index))),
  { type: "imageSection", attrs: { sectionId: "end" } },
  { type: "paragraph" },
);

type Spot = "Seitenanfang" | "Seitenende" | "Kapitelmitte";
type EditorElement = HTMLElement & {
  editor: {
    getJSON: () => unknown;
    state: { doc: { child: (i: number) => { nodeSize: number } } };
    view: { pasteHTML: (html: string) => boolean };
  };
};

let admin: SupabaseClient;
let account: TestAccount;
let projectId = "";
let chapterId = "";

const editorJson = (page: Page) =>
  page.evaluate(() => JSON.stringify((document.querySelector(".tiptap-editor") as EditorElement).editor.getJSON()));

async function spotPosition(page: Page, spot: Spot): Promise<number> {
  if (spot === "Kapitelmitte") {
    return page.evaluate(() => {
      const { state } = (document.querySelector(".tiptap-editor") as EditorElement).editor;
      let position = 0;
      for (let i = 0; i < 6; i += 1) position += state.doc.child(i).nodeSize;
      return position + 40;
    });
  }
  const softBreak = await firstSoftBreakPosition(page);
  expect(softBreak, "Das Testkapitel hat einen Seitenwechsel im Absatz").toBeGreaterThan(0);
  return spot === "Seitenende" ? softBreak - 6 : softBreak + 6;
}

const click = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true }).click();

const ACTIONS: Array<{ name: string; prepare?: (page: Page) => Promise<void>; run: (page: Page) => Promise<void>; after?: (page: Page) => Promise<void> }> = [
  { name: "Tippen", run: (page) => page.keyboard.type("Hallo Welt ") },
  { name: "Neue Zeile", run: (page) => page.keyboard.press("Enter") },
  { name: "Rücktaste", run: (page) => page.keyboard.press("Backspace") },
  { name: "Entfernen", run: (page) => page.keyboard.press("Delete") },
  {
    name: "Einfügen aus der Zwischenablage",
    run: (page) =>
      page.evaluate(() => {
        (document.querySelector(".tiptap-editor") as EditorElement).editor.view.pasteHTML(
          "<p>Eingefügter erster Absatz mit etwas Text.</p><p>Eingefügter zweiter Absatz.</p>",
        );
      }),
  },
  {
    name: "Rückgängig",
    prepare: async (page) => {
      await page.keyboard.type("Wird gleich zurückgenommen ");
      await page.waitForTimeout(250);
    },
    run: (page) => click(page, "Rückgängig"),
  },
  {
    name: "Wiederherstellen",
    prepare: async (page) => {
      await page.keyboard.type("Kommt gleich wieder ");
      await page.waitForTimeout(200);
      await click(page, "Rückgängig");
      await page.waitForTimeout(250);
    },
    run: (page) => click(page, "Wiederherstellen"),
  },
  {
    name: "Fett",
    prepare: async (page) => {
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
    },
    run: (page) => click(page, "Fett"),
  },
  { name: "Aufzählung", run: (page) => click(page, "Aufzählung") },
  { name: "Nummerierte Liste", run: (page) => click(page, "Nummerierte Liste") },
  { name: "Zitat", run: (page) => click(page, "Blockzitat") },
  { name: "Seitenumbruch", run: (page) => click(page, "Seitenumbruch einfügen") },
  {
    name: "Zeilenabstand",
    run: async (page) => {
      await page.getByLabel("Zeilenabstand").click();
      await page.getByRole("option", { name: "2,0" }).click();
    },
  },
  {
    name: "Zoom",
    run: async (page) => {
      await page.getByLabel("Vergrößern", { exact: true }).click();
    },
    after: async (page) => {
      await page.getByLabel("Verkleinern", { exact: true }).click();
    },
  },
];

async function resetTo(page: Page, spot: Spot) {
  await setEditorContent(page, BASE_DOC);
  await page.waitForTimeout(350);
  await focusEditorAt(page, await spotPosition(page, spot));
}

test.describe("PROJ-25 — Prüfliste", () => {
  test.use({ storageState: SESSION_FILE });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    const env = readEnvLocal();
    assertStage(env);
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    account = await createTestAccount(admin, { email: `e2e-proj25-liste-${RUN_ID}@example.test`, name: "Test Liste" });
    const { data: project, error } = await admin
      .from("projects")
      .insert({ title: "Editor-Prüfliste", owner_id: account.id })
      .select("id")
      .single();
    if (error || !project) throw new Error(error?.message ?? "Projekt fehlt");
    projectId = project.id as string;
    await admin.from("project_access").insert({ project_id: projectId, expires_at: "2028-06-15T12:00:00Z" });
    await admin.from("project_members").insert({ project_id: projectId, user_id: account.id, role: "projektleiter" });
    chapterId = crypto.randomUUID();
    const images = [];
    for (const [index, color] of ([[150, 184, 151], [208, 188, 166], [74, 69, 63]] as Array<[number, number, number]>).entries()) {
      const storagePath = `${projectId}/${chapterId}/bild-${index}.png`;
      const { error: uploadError } = await admin.storage
        .from("chapter-heroes")
        .upload(storagePath, solidPng(600, 400, color), { contentType: "image/png" });
      if (uploadError) throw new Error(uploadError.message);
      images.push({ id: crypto.randomUUID(), storage_path: storagePath, signed_url: "", alt: `bild-${index}` });
    }
    const { error: chapterError } = await admin.from("chapters").insert(
      {
        id: chapterId,
        project_id: projectId,
        title: "Prüfliste",
        sort_order: 0,
        chapter_origin: "custom",
        body: BASE_DOC,
        word_count: 900,
        page_count: 6,
        image_sections: { start: { layout: "1-spaltig", images: [] }, end: { layout: "1-spaltig", images }, placed: true },
      } as never,
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
      const { data: files } = await admin.storage.from("chapter-heroes").list(`${projectId}/${chapterId}`);
      if (files?.length) await admin.storage.from("chapter-heroes").remove(files.map((f) => `${projectId}/${chapterId}/${f.name}`));
      await admin.from("mail_log").delete().eq("project_id", projectId);
      await admin.from("projects").delete().eq("id", projectId);
      await admin.from("trash_chapters").delete().eq("project_id", projectId);
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
    }
    if (account) await admin.auth.admin.deleteUser(account.id);
  });

  for (const spot of ["Seitenanfang", "Seitenende", "Kapitelmitte"] as Spot[]) {
    test(`AC-13: Alle Abläufe am ${spot}`, async ({ page }) => {
      test.setTimeout(150_000);
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`Browserfehler: ${error.message.slice(0, 120)}`));
      await page.goto(`/projektuebersicht/${projectId}/kapiteleditor/${chapterId}`);
      await waitForEditorReady(page);

      for (const action of ACTIONS) {
        await resetTo(page, spot);
        await action.prepare?.(page);
        const before = await editorJson(page);
        await startMotion(page);
        await action.run(page);
        // Der Cursor folgt nach 350 ms mit einer weichen Scroll-Bewegung.
        await page.waitForTimeout(850);
        const motion = await stopMotion(page);
        if (action.name !== "Zoom" && motion.moves > 1) problems.push(`${action.name}: Bilder ${motion.moves}-mal bewegt`);
        if (motion.returns > 0) problems.push(`${action.name}: Bilder springen zurück`);
        const audit = await auditEditor(page);
        for (const violation of audit.violations) {
          problems.push(`${action.name}: ${violation.kind} auf Seite ${violation.page ?? "?"}`);
        }
        const caret = await caretInfo(page);
        if (!caret.inContentArea) problems.push(`${action.name}: Cursor außerhalb des Inhaltsbereichs`);
        if (!caret.inViewport) problems.push(`${action.name}: Cursor nicht sichtbar`);
        if (action.name !== "Zoom" && (await editorJson(page)) === before) {
          problems.push(`${action.name}: Die Aktion hat nichts geändert`);
        }
        await action.after?.(page);
      }
      expect(problems).toEqual([]);
    });
  }

  test("AC-13: Beim Zoomen bleibt der Cursor an seinem Platz auf dem Bildschirm", async ({ page }) => {
    await page.goto(`/projektuebersicht/${projectId}/kapiteleditor/${chapterId}`);
    await waitForEditorReady(page);
    await resetTo(page, "Kapitelmitte");
    const caretTop = () =>
      page.evaluate(() => {
        const { editor } = document.querySelector(".tiptap-editor") as unknown as {
          editor: { view: { coordsAtPos: (p: number) => { top: number } }; state: { selection: { head: number } } };
        };
        return editor.view.coordsAtPos(editor.state.selection.head).top;
      });
    const before = await caretTop();
    for (const label of ["Vergrößern", "Vergrößern", "Verkleinern", "Verkleinern", "Verkleinern", "Vergrößern"]) {
      await page.getByLabel(label, { exact: true }).click();
      await page.waitForTimeout(250);
      expect(Math.abs((await caretTop()) - before), `${label}: Cursor bleibt stehen`).toBeLessThanOrEqual(12);
    }
  });

  test("AC-13: Gespeicherter Stand kommt nach dem Neuladen gleich zurück", async ({ page }) => {
    await page.goto(`/projektuebersicht/${projectId}/kapiteleditor/${chapterId}`);
    await waitForEditorReady(page);
    await setEditorContent(page, BASE_DOC);
    await page.waitForTimeout(300);
    await focusEditorAt(page, await spotPosition(page, "Seitenende"));
    await page.keyboard.type("Das bleibt gespeichert. ");
    await page.keyboard.press("Enter");
    await click(page, "Blockzitat");
    await page.keyboard.type("Ein Zitat bleibt auch.");
    await page.waitForTimeout(300);
    await page.getByText("Wird gespeichert").waitFor({ timeout: 5_000 }).catch(() => undefined);
    await waitForSaved(page);
    const saved = await editorJson(page);
    const before = await auditEditor(page);
    await page.reload();
    await waitForEditorReady(page);
    await page.waitForTimeout(400);
    const strip = (json: string) => json.replace(/­/g, "");
    expect(strip(await editorJson(page))).toBe(strip(saved));
    const after = await auditEditor(page);
    expect(after.pages).toBe(before.pages);
    expect(after.violations).toEqual([]);
  });
});
