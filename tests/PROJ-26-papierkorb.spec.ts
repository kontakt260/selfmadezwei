import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSync } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { waitForEditorReady, waitForSaved } from "./helpers/editor-audit";
import { waitForPage } from "./helpers/page-ready";
import { accessToken, createTestAccount, readEnvLocal, restRequest, signIn, STAGE_HOST, storageFileExists } from "./helpers/stage";

// PROJ-26 — echter Papierkorb gegen die Stage-Datenbank und den Dateispeicher.
//
// ACHTUNG: Diese Suite legt temporäre Konten und Projekte an und löscht sie
// wirklich. Sie läuft deshalb nur mit `E2E_TRASH=1` und nur gegen Stage:
//
//   E2E_TRASH=1 npx playwright test tests/PROJ-26-papierkorb.spec.ts --project=chromium
//
// Das QA-Konto wird nie angefasst, es werden keine Mails ausgelöst. Der Cron
// wird nicht aufgerufen, weil er echte Erinnerungen verschicken könnte.

const ENABLED = process.env.E2E_TRASH === "1";
// Die Adressen stehen in der Mitgliederliste, deshalb ohne das geprüfte Wort.
const TEST_EMAIL_PREFIX = "e2e-loeschtest-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const RACE_ROUNDS = 12;

type Account = { id: string; email: string; password: string; name: string };
type Role = "projektleiter" | "co_author";
type TestProject = { id: string; title: string; chapters: string[] };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAFAAH/e+m+7wAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

let admin: SupabaseClient;
let supabaseUrl = "";
let anonKey = "";
let L: Account;
let C: Account;
let O: Account;
let contextL: BrowserContext | undefined;
let contextC: BrowserContext | undefined;
let contextO: BrowserContext | undefined;
let pageL: Page;
let pageC: Page;
let pageO: Page;
let tokenL = "";
let tokenC = "";
let tokenO = "";

const accounts: Account[] = [];
const projectIds = new Set<string>();
const uploaded: Array<{ bucket: string; path: string }> = [];

async function createAccount(label: string, name: string): Promise<Account> {
  const account = await createTestAccount(admin, {
    email: `${TEST_EMAIL_PREFIX}${label}-${RUN_ID}@example.test`,
    name: name,
  });
  accounts.push(account);
  return account;
}

async function upload(bucket: string, file: string, body: Buffer, contentType: string) {
  const { error } = await admin.storage.from(bucket).upload(file, body, { contentType });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  uploaded.push({ bucket, path: file });
}

async function createProject(input: {
  title: string;
  members: Array<[Account, Role]>;
  chapters?: number;
  files?: boolean;
}): Promise<TestProject> {
  const id = crypto.randomUUID();
  const title = `${input.title} ${RUN_ID}`;
  projectIds.add(id);
  const owner = input.members[0]?.[0] ?? null;

  const project = await admin.from("projects").insert({ id, title, owner_id: owner?.id ?? null });
  if (project.error) throw new Error(project.error.message);
  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + 200 * DAY_MS).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);

  for (const [index, [member, role]] of input.members.entries()) {
    const row = await admin.from("project_members").insert({
      project_id: id,
      user_id: member.id,
      role,
      created_at: new Date(Date.now() + index * 1000).toISOString(),
    });
    if (row.error) throw new Error(row.error.message);
  }

  const chapters: string[] = [];
  for (let index = 0; index < (input.chapters ?? 2); index += 1) {
    const chapterId = crypto.randomUUID();
    const storagePath = `${id}/${chapterId}/bild.png`;
    const chapter = await admin.from("chapters").insert({
      id: chapterId,
      project_id: id,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      page_count: 2,
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: `Text ${index + 1}` }] }],
      },
      image_sections: {
        start: {
          layout: "1-spaltig",
          images: input.files ? [{ id: "img", storage_path: storagePath, signed_url: "", alt: "" }] : [],
        },
        end: { layout: "1-spaltig", images: [] },
      },
    });
    if (chapter.error) throw new Error(chapter.error.message);
    chapters.push(chapterId);
    if (input.files) await upload("chapter-heroes", storagePath, PNG, "image/png");
  }

  if (input.files) {
    await upload("project-covers", `${id}/cover.png`, PNG, "image/png");
    await upload("project-logos", `${id}/logo.png`, PNG, "image/png");
    await upload("exports", `${id}/buch.pdf`, PDF, "application/pdf");
  }
  return { id, title, chapters };
}

function rest(pathname: string, init: RequestInit, token?: string): Promise<Response> {
  return restRequest({ supabaseUrl, anonKey, prefer: "return=minimal" }, pathname, init, token);
}

const asUser = (token: string): SupabaseClient =>
  createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

async function visibleRows(table: string, filter: string, token: string): Promise<number> {
  const response = await rest(`${table}?select=*&${filter}`, { method: "GET" }, token);
  expect(response.status).toBe(200);
  return ((await response.json()) as unknown[]).length;
}

const count = async (table: string, column: string, value: string): Promise<number> => {
  const { count: total, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw new Error(error.message);
  return total ?? 0;
};

function fileExists(bucket: string, file: string): Promise<boolean> {
  return storageFileExists(admin, bucket, file);
}

async function waitForServerAction(page: Page, action: () => Promise<void>): Promise<void> {
  const done = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
    { timeout: 20_000 },
  );
  await action();
  await done;
}

async function deleteChapterInUi(page: Page, project: TestProject, title: string) {
  await page.goto(`/projektuebersicht/${project.id}`);
  await waitForPage(page);
  await page.getByRole("button", { name: `Kapitel „${title}" löschen` }).click();
  await expect(page.getByText("Eine Wiederherstellung ist nicht möglich.")).toBeVisible();
  const confirm = page.getByRole("button", { name: /Endgültig löschen/ });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await waitForServerAction(page, () => confirm.click());
}

async function deleteProjectInUi(page: Page, project: TestProject) {
  await page.goto("/");
  await waitForPage(page);
  await page.getByRole("button", { name: `Projekt „${project.title}" löschen` }).click();
  await expect(page.getByText("unwiderruflich und endgültig")).toBeVisible();
  await page.getByRole("button", { name: "Weiter zur Bestätigung" }).click();
  const phrase = (await page.locator('[role="dialog"] p[aria-live="polite"]').innerText()).trim();
  await page.getByLabel("Bestätigungstext eingeben").fill(phrase);
  await waitForServerAction(page, () =>
    page.getByRole("button", { name: "Endgültig löschen" }).click(),
  );
}

const deleteProjectAs = (token: string, id: string) =>
  rest(`projects?id=eq.${id}`, { method: "DELETE" }, token);
const deleteChapterAs = (token: string, id: string) =>
  rest(`chapters?id=eq.${id}`, { method: "DELETE" }, token);

async function setDue(table: "trash_chapters" | "trash_projects", column: string, id: string) {
  const { error } = await admin
    .from(table)
    .update({ purge_at: new Date(Date.now() - 60_000).toISOString() })
    .eq(column, id);
  expect(error).toBeNull();
}

/** Der tägliche Lauf wirkt auf ganz Stage: Fällig darf nur sein, was dieser Lauf angelegt hat. */
async function assertOnlyOwnItemsDue(): Promise<void> {
  const now = new Date().toISOString();
  const [projects, chapters] = await Promise.all([
    admin.from("trash_projects").select("project_id").lte("purge_at", now),
    admin.from("trash_chapters").select("project_id").lte("purge_at", now),
  ]);
  for (const row of [...(projects.data ?? []), ...(chapters.data ?? [])]) {
    expect(projectIds.has(row.project_id)).toBe(true);
  }
}

/** Führt den echten Aufräum-Code aus, ohne den Cron und seine Mails auszulösen. */
async function runRealFileCleanup(ids: string[]) {
  // `server-only` gibt es nur im Next.js-Build. Der echte Code wird deshalb
  // einmal gebündelt, mit einem leeren Modul an dieser Stelle.
  const repo = process.cwd();
  const outfile = path.join(os.tmpdir(), `narravit-cleanup-${RUN_ID}-${Date.now()}.cjs`);
  buildSync({
    absWorkingDir: repo,
    entryPoints: ["src/lib/projects/storage-cleanup.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    outfile,
    alias: { "server-only": path.join(repo, "src/test/empty.ts") },
  });
  let cleanup: typeof import("../src/lib/projects/storage-cleanup");
  try {
    cleanup = createRequire(__filename)(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }

  const { data: queued } = await admin.from("storage_chapter_cleanup_queue").select("project_id");
  for (const row of queued ?? []) expect(projectIds.has(row.project_id)).toBe(true);

  return {
    projects: await cleanup.processStorageCleanup(ids),
    chapters: await cleanup.processChapterStorageCleanup(),
  };
}

test.describe("PROJ-26 — Papierkorb (nur Stage)", () => {
  test.skip(!ENABLED, "Löscht echte Testdaten, nur mit E2E_TRASH=1");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const env = readEnvLocal();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (new URL(supabaseUrl).host !== STAGE_HOST) throw new Error("Diese Suite läuft nur gegen Stage.");
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    L = await createAccount("leitung", "Lena Leitung");
    C = await createAccount("co", "Carl Co");
    O = await createAccount("aussen", "Olga Aussen");

    // Ohne Projekt landet ein Konto im Onboarding, die Anmeldung gilt trotzdem.
    contextL = await browser.newContext();
    contextC = await browser.newContext();
    contextO = await browser.newContext();
    pageL = await contextL.newPage();
    pageC = await contextC.newPage();
    pageO = await contextO.newPage();
    await signIn(pageL, L);
    await signIn(pageC, C);
    await signIn(pageO, O);
    tokenL = accessToken(await contextL.cookies());
    tokenC = accessToken(await contextC.cookies());
    tokenO = accessToken(await contextO.cookies());
  });

  test.afterAll(async () => {
    await contextL?.close();
    await contextC?.close();
    await contextO?.close();
    if (!admin) return;

    for (const id of projectIds) {
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", id);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", id);
      await admin.from("projects").delete().eq("id", id);
    }
    for (const bucket of ["chapter-heroes", "project-covers", "project-logos", "exports"]) {
      const files = uploaded.filter((file) => file.bucket === bucket).map((file) => file.path);
      if (files.length > 0) await admin.storage.from(bucket).remove(files);
    }
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  // ─── A + B: Kapitel löschen ────────────────────────────────────────────────

  let shared: TestProject;

  test("AC-1, AC-5, AC-6: Kapitel verschwindet für alle und bleibt auf dem Server", async () => {
    shared = await createProject({
      title: "Gemeinsam",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: 3,
      files: true,
    });
    await admin.from("chapter_contributors").insert({ chapter_id: shared.chapters[0], user_id: C.id });

    await deleteChapterInUi(pageC, shared, "Kapitel 1");

    await expect
      .poll(() => count("trash_chapters", "chapter_id", shared.chapters[0]), { timeout: 10_000 })
      .toBe(1);
    expect(await count("chapters", "id", shared.chapters[0])).toBe(0);

    await pageL.goto(`/projektuebersicht/${shared.id}`);
    await expect(pageL.getByRole("button", { name: `Kapitel „Kapitel 2" löschen` })).toBeVisible();
    await expect(pageL.getByRole("button", { name: `Kapitel „Kapitel 1" löschen` })).toHaveCount(0);

    const { data: entry } = await admin
      .from("trash_chapters")
      .select("*")
      .eq("chapter_id", shared.chapters[0])
      .single();
    expect(entry.deleted_by).toBe(C.id);
    expect(entry.title).toBe("Kapitel 1");
    expect(entry.snapshot.body.content[0].content[0].text).toBe("Text 1");
    const { data: people } = await admin
      .from("trash_chapter_people")
      .select("user_id, was_member, first_contributed_at")
      .eq("chapter_id", shared.chapters[0]);
    expect(people).toHaveLength(2);
    expect(people?.every((person) => person.was_member)).toBe(true);
    expect(people?.find((person) => person.user_id === C.id)?.first_contributed_at).toBeTruthy();
    const days = (new Date(entry.purge_at).getTime() - new Date(entry.deleted_at).getTime()) / DAY_MS;
    expect(days).toBeCloseTo(14, 3);

    const { data: rest2 } = await admin
      .from("chapters")
      .select("start_page, sort_order")
      .eq("project_id", shared.id)
      .order("sort_order");
    expect(rest2?.[0].start_page).toBe(1);
  });

  test("AC-7: Oberfläche erwähnt weder Papierkorb noch Wiederherstellung", async () => {
    await pageL.goto(`/projektuebersicht/${shared.id}`);
    const text = await pageL.locator("body").innerText();
    expect(text).not.toMatch(/papierkorb/i);
    expect(text).not.toMatch(/wiederherstell/i);
  });

  test("AC-8, AC-9: Bilder des gelöschten Kapitels sind im echten Speicher gesperrt", async () => {
    const lockedFolder = `${shared.id}/${shared.chapters[0]}`;
    const lockedFile = `${lockedFolder}/bild.png`;

    for (const token of [tokenL, tokenC]) {
      const storage = asUser(token).storage.from("chapter-heroes");

      const list = await storage.list(lockedFolder);
      expect(list.data ?? []).toHaveLength(0);

      const download = await storage.download(lockedFile);
      expect(download.data).toBeNull();

      const signed = await storage.createSignedUrl(lockedFile, 60);
      expect(signed.data?.signedUrl).toBeUndefined();

      const added = await storage.upload(`${lockedFolder}/neu.png`, PNG, { contentType: "image/png" });
      expect(added.error).not.toBeNull();

      const overwrite = await storage.update(lockedFile, PDF, { contentType: "image/png" });
      expect(overwrite.error).not.toBeNull();

      await storage.remove([lockedFile]);
      expect(await fileExists("chapter-heroes", lockedFile)).toBe(true);

      // Kopieren und Verschieben aus dem und in den gesperrten Ordner.
      const copyTarget = `${shared.id}/${shared.chapters[1]}/kopie.png`;
      const moveTarget = `${shared.id}/${shared.chapters[1]}/weg.png`;
      const intoLocked = `${lockedFolder}/hinein.png`;
      uploaded.push(
        { bucket: "chapter-heroes", path: copyTarget },
        { bucket: "chapter-heroes", path: moveTarget },
        { bucket: "chapter-heroes", path: intoLocked },
      );
      expect((await storage.copy(lockedFile, copyTarget)).error).not.toBeNull();
      expect((await storage.move(lockedFile, moveTarget)).error).not.toBeNull();
      expect(await fileExists("chapter-heroes", lockedFile)).toBe(true);
      const liveFile = `${shared.id}/${shared.chapters[1]}/bild.png`;
      expect((await storage.move(liveFile, intoLocked)).error).not.toBeNull();
      expect(await fileExists("chapter-heroes", liveFile)).toBe(true);
    }

    const member = asUser(tokenC).storage;
    const sibling = await member
      .from("chapter-heroes")
      .createSignedUrl(`${shared.id}/${shared.chapters[1]}/bild.png`, 60);
    expect(sibling.data?.signedUrl).toBeTruthy();
    const cover = await member.from("project-covers").createSignedUrl(`${shared.id}/cover.png`, 60);
    expect(cover.data?.signedUrl).toBeTruthy();
  });

  test("AC-10: Link auf gelöschtes Kapitel verhält sich wie ein nicht vorhandenes", async () => {
    const notFound = pageL.getByRole("heading", { name: "Diese Seite gibt es nicht" });
    const gone = await pageL.goto(
      `/projektuebersicht/${shared.id}/kapiteleditor/${shared.chapters[0]}`,
    );
    await expect(notFound).toBeVisible();
    const goneText = await pageL.locator("body").innerText();
    const unknown = await pageL.goto(
      `/projektuebersicht/${shared.id}/kapiteleditor/${crypto.randomUUID()}`,
    );
    await expect(notFound).toBeVisible();
    const unknownText = await pageL.locator("body").innerText();

    expect(gone?.status()).toBe(404);
    expect(unknown?.status()).toBe(404);
    expect(goneText).toBe(unknownText);
  });

  test("AC-8 Red Team: Kunden kommen nicht an den Papierkorb", async () => {
    const trashed = shared.chapters[0];

    for (const token of [tokenL, tokenC, tokenO, undefined]) {
      for (const table of [
        "trash_chapters",
        "trash_projects",
        "trash_project_members",
        "trash_chapter_people",
        "storage_chapter_cleanup_queue",
      ]) {
        const read = await rest(`${table}?select=*`, { method: "GET" }, token);
        expect([401, 403]).toContain(read.status);
        const write = await rest(`${table}?chapter_id=eq.${trashed}`, { method: "DELETE" }, token);
        expect(write.status).toBeGreaterThanOrEqual(400);
      }

      for (const [fn, body] of [
        ["trash_find", { p_search: "a" }],
        ["trash_restore_chapter", { p_chapter_id: trashed }],
        ["trash_restore_project", { p_project_id: shared.id }],
        ["trash_delete_chapter_now", { p_chapter_id: trashed }],
        ["trash_delete_project_now", { p_project_id: shared.id }],
        ["trash_purge_due", {}],
      ] as const) {
        const call = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) }, token);
        expect([401, 403, 404]).toContain(call.status);
      }

      const hidden = await rest(
        "rpc/chapter_file_in_trash",
        {
          method: "POST",
          body: JSON.stringify({ p_name: `x/${trashed}/y` }),
          headers: { "Content-Profile": "private" },
        },
        token,
      );
      expect(hidden.status).toBeGreaterThanOrEqual(400);
    }

    const graphql = await fetch(`${supabaseUrl}/graphql/v1`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${tokenL}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
    });
    expect((await graphql.text()).toLowerCase()).not.toContain("trash");

    // Gelöschte ID übernehmen, direkt und per Upsert.
    const recreate = await rest(
      "chapters",
      {
        method: "POST",
        body: JSON.stringify({ id: trashed, project_id: shared.id, title: "Fake", sort_order: 9 }),
      },
      tokenL,
    );
    expect(recreate.status).toBe(403);
    const upsert = await rest(
      "chapters",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: trashed, project_id: shared.id, title: "Fake", sort_order: 9 }),
      },
      tokenL,
    );
    expect(upsert.status).toBe(403);
    expect(await count("chapters", "id", trashed)).toBe(0);

    // Kapitel in ein anderes eigenes Projekt verschieben, direkt und per Upsert.
    const other = await createProject({ title: "Anderes", members: [[C, "projektleiter"]], chapters: 1 });
    const move = await rest(
      `chapters?id=eq.${shared.chapters[1]}`,
      { method: "PATCH", body: JSON.stringify({ project_id: other.id }) },
      tokenC,
    );
    expect(move.status).toBe(403);
    const moveUpsert = await rest(
      "chapters",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: shared.chapters[1],
          project_id: other.id,
          title: "Kapitel 2",
          sort_order: 1,
        }),
      },
      tokenC,
    );
    expect(moveUpsert.status).toBeGreaterThanOrEqual(400);
    const { data: stillThere } = await admin
      .from("chapters")
      .select("project_id")
      .eq("id", shared.chapters[1])
      .single();
    expect(stillThere?.project_id).toBe(shared.id);

    // Außenstehende löschen nichts.
    await deleteChapterAs(tokenO, shared.chapters[1]);
    expect(await count("chapters", "id", shared.chapters[1])).toBe(1);
    expect(await count("trash_chapters", "chapter_id", shared.chapters[1])).toBe(0);
  });

  test("AC-14, AC-15, AC-17: Support findet und holt das Kapitel zurück", async () => {
    const { data: hits, error } = await admin.rpc("trash_find", { p_search: C.email });
    expect(error).toBeNull();
    const hit = hits.find((row: { item_id: string }) => row.item_id === shared.chapters[0]);
    expect(hit).toMatchObject({ item_type: "chapter", title: "Kapitel 1", deleted_by_email: C.email });
    expect(hit.member_emails).toContain(L.email);
    expect(JSON.stringify(hits)).not.toContain("Text 1");

    const restored = await admin.rpc("trash_restore_chapter", { p_chapter_id: shared.chapters[0] });
    expect(restored.error).toBeNull();
    expect(restored.data.movedToEnd).toBe(false);

    const { data: back } = await admin
      .from("chapters")
      .select("title, sort_order, body, start_page")
      .eq("id", shared.chapters[0])
      .single();
    expect(back).toMatchObject({ title: "Kapitel 1", sort_order: 0, start_page: 1 });
    expect(back?.body.content[0].content[0].text).toBe("Text 1");
    expect(await count("chapter_contributors", "chapter_id", shared.chapters[0])).toBe(1);
    expect(await count("trash_chapters", "chapter_id", shared.chapters[0])).toBe(0);

    const file = await asUser(tokenC)
      .storage.from("chapter-heroes")
      .createSignedUrl(`${shared.id}/${shared.chapters[0]}/bild.png`, 60);
    expect(file.data?.signedUrl).toBeTruthy();

    await pageC.goto(`/projektuebersicht/${shared.id}`);
    await expect(pageC.getByRole("button", { name: `Kapitel „Kapitel 1" löschen` })).toBeVisible();
  });

  test("Edge: Autosave meldet Fehler und holt ein gelöschtes Kapitel nicht zurück", async () => {
    const chapter = shared.chapters[2];
    await pageC.goto(`/projektuebersicht/${shared.id}/kapiteleditor/${chapter}`);
    await waitForPage(pageC);
    await waitForEditorReady(pageC);
    const editor = pageC.locator(".ProseMirror").first();
    // PROJ-34: Ein Foto am Anfang steht jetzt im Text. Geschrieben wird im Absatz.
    await editor.locator("p").first().click();
    await pageC.keyboard.type(" erster Stand");
    await waitForSaved(pageC);

    expect((await deleteChapterAs(tokenL, chapter)).status).toBeLessThan(300);
    await pageC.keyboard.type(" zweiter Stand");

    await expect(pageC.getByText("Fehler beim Speichern")).toBeVisible({ timeout: 15_000 });
    expect(await count("chapters", "id", chapter)).toBe(0);
    const { data: entry } = await admin
      .from("trash_chapters")
      .select("snapshot")
      .eq("chapter_id", chapter)
      .single();
    expect(JSON.stringify(entry?.snapshot)).toContain("erster Stand");

    const restored = await admin.rpc("trash_restore_chapter", { p_chapter_id: chapter });
    expect(restored.error).toBeNull();
  });

  // ─── A + B: Projekt löschen ────────────────────────────────────────────────

  let invitationToken = "";
  let expiresBefore = "";

  test("AC-4: Mitschreibende können ein Projekt nicht löschen", async () => {
    await deleteProjectAs(tokenC, shared.id);
    expect(await count("trash_projects", "project_id", shared.id)).toBe(0);
    expect(await visibleRows("chapters", `project_id=eq.${shared.id}`, tokenC)).toBe(3);
  });

  test("AC-2, AC-3, AC-11: Projekt verschwindet für alle, ohne Mail", async () => {
    invitationToken = crypto.randomBytes(24).toString("hex");
    const invitation = await admin.from("invitations").insert({
      project_id: shared.id,
      email: `neu-${RUN_ID}@example.test`,
      role: "co_author",
      token: invitationToken,
      is_gift: false,
      expires_at: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    });
    expect(invitation.error).toBeNull();
    const { data: access } = await admin
      .from("project_access")
      .select("expires_at")
      .eq("project_id", shared.id)
      .single();
    expiresBefore = access?.expires_at;

    // Dieses Kapitel liegt schon vor dem Projekt im Papierkorb (AC-19).
    await deleteChapterAs(tokenC, shared.chapters[0]);
    await deleteProjectInUi(pageL, shared);

    await expect
      .poll(() => count("trash_projects", "project_id", shared.id), { timeout: 10_000 })
      .toBe(1);
    expect(await count("projects", "id", shared.id)).toBe(1);
    expect(await count("chapters", "project_id", shared.id)).toBe(2);
    expect(await count("project_members", "project_id", shared.id)).toBe(0);
    expect(await count("trash_project_members", "project_id", shared.id)).toBe(2);
    expect(await count("mail_log", "project_id", shared.id)).toBe(0);
    const queued = await admin
      .from("mail_retry_queue")
      .select("id")
      .contains("payload", { projectId: shared.id });
    expect(queued.data ?? []).toHaveLength(0);
  });

  test("AC-8: Niemand erreicht das gelöschte Projekt, auch nicht direkt", async () => {
    for (const token of [tokenL, tokenC]) {
      expect(await visibleRows("projects", `id=eq.${shared.id}`, token)).toBe(0);
      expect(await visibleRows("chapters", `project_id=eq.${shared.id}`, token)).toBe(0);
      expect(await visibleRows("project_covers", `project_id=eq.${shared.id}`, token)).toBe(0);
      expect(await visibleRows("project_access", `project_id=eq.${shared.id}`, token)).toBe(0);
      expect(await visibleRows("project_members", `project_id=eq.${shared.id}`, token)).toBe(0);

      const storage = asUser(token).storage;
      for (const [bucket, file] of [
        ["chapter-heroes", `${shared.id}/${shared.chapters[1]}/bild.png`],
        ["project-covers", `${shared.id}/cover.png`],
        ["project-logos", `${shared.id}/logo.png`],
        ["exports", `${shared.id}/buch.pdf`],
      ]) {
        const signed = await storage.from(bucket).createSignedUrl(file, 60);
        expect(signed.data?.signedUrl).toBeUndefined();
        await storage.from(bucket).remove([file]);
        expect(await fileExists(bucket, file)).toBe(true);
      }

      const rejoin = await rest(
        "project_members",
        {
          method: "POST",
          body: JSON.stringify({ project_id: shared.id, user_id: L.id, role: "projektleiter" }),
        },
        token,
      );
      expect(rejoin.status).toBeGreaterThanOrEqual(400);

      const rename = await rest(
        `projects?id=eq.${shared.id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ title: "Gehackt" }),
        },
        token,
      );
      expect(await rename.json()).toEqual([]);
    }

    const direct = await admin
      .from("project_members")
      .insert({ project_id: shared.id, user_id: O.id, role: "co_author" });
    expect(direct.error?.message).toContain("project_in_trash");
  });

  test("AC-10: Link auf gelöschtes Projekt verhält sich wie ein nicht vorhandenes", async () => {
    const gone = await pageC.goto(`/projektuebersicht/${shared.id}`);
    const goneText = await pageC.locator("body").innerText();
    const unknown = await pageC.goto(`/projektuebersicht/${crypto.randomUUID()}`);
    const unknownText = await pageC.locator("body").innerText();

    expect(gone?.status()).toBe(unknown?.status());
    expect(goneText).toBe(unknownText);

    await pageC.goto("/");
    await expect(pageC.locator("body")).not.toContainText(shared.title);
  });

  test("AC-13: Einladung zu einem gelöschten Projekt ist ungültig", async () => {
    await pageO.goto(`/einladung/${invitationToken}`);
    await expect(pageO.getByRole("heading", { name: "Einladung nicht gefunden" })).toBeVisible();
    await expect(pageO.locator("body")).not.toContainText(shared.title);
  });

  test("AC-26: Konto-Lösch-Dialog zeigt das gelöschte Projekt nicht", async () => {
    const keep = await createProject({ title: "Sichtbar", members: [[L, "projektleiter"]], chapters: 1 });
    await pageL.goto("/persoenlicher-bereich");
    await expect(pageL.locator("#account-email")).toHaveText(L.email);
    await pageL.getByRole("button", { name: "Konto löschen", exact: true }).click();
    const dialog = pageL.getByRole("alertdialog");
    await expect(dialog.getByText("Wird gelöscht")).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText(keep.title);
    await expect(dialog).not.toContainText(shared.title);
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await admin.from("projects").delete().eq("id", keep.id);
    projectIds.delete(keep.id);
  });

  test("AC-18, AC-19: Support holt das Projekt vollständig zurück", async () => {
    const chapterEarly = await admin.rpc("trash_restore_chapter", { p_chapter_id: shared.chapters[0] });
    expect(chapterEarly.error?.message).toContain("project_in_trash");

    const restored = await admin.rpc("trash_restore_project", { p_project_id: shared.id });
    expect(restored.error).toBeNull();

    const { data: members } = await admin
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", shared.id);
    expect(members).toHaveLength(2);
    expect(members?.find((row) => row.user_id === L.id)?.role).toBe("projektleiter");
    expect(members?.find((row) => row.user_id === C.id)?.role).toBe("co_author");

    expect(await visibleRows("chapters", `project_id=eq.${shared.id}`, tokenC)).toBe(2);
    expect(await count("trash_chapters", "chapter_id", shared.chapters[0])).toBe(1);

    const { data: access } = await admin
      .from("project_access")
      .select("expires_at")
      .eq("project_id", shared.id)
      .single();
    expect(new Date(access?.expires_at).getTime()).toBe(new Date(expiresBefore).getTime());

    const cover = await asUser(tokenC)
      .storage.from("project-covers")
      .createSignedUrl(`${shared.id}/cover.png`, 60);
    expect(cover.data?.signedUrl).toBeTruthy();

    await pageO.goto(`/einladung/${invitationToken}`);
    await expect(pageO.getByRole("heading", { name: "Einladung nicht gefunden" })).toHaveCount(0);

    await pageC.goto("/");
    await expect(pageC.locator("body")).toContainText(shared.title);

    const chapterLater = await admin.rpc("trash_restore_chapter", { p_chapter_id: shared.chapters[0] });
    expect(chapterLater.error).toBeNull();
  });

  test("Edge: Letztes Projekt gelöscht, Person landet im Onboarding", async () => {
    const solo = await createProject({ title: "Einzeln", members: [[O, "projektleiter"]], chapters: 1 });
    await deleteProjectInUi(pageO, solo);
    await expect
      .poll(() => count("trash_projects", "project_id", solo.id), { timeout: 10_000 })
      .toBe(1);
    await pageO.goto("/");
    await pageO.waitForURL(/\/onboarding/, { timeout: 15_000 });
    await expect(pageO.getByRole("link", { name: "Zum persönlichen Bereich" })).toBeVisible();
  });

  // ─── D: Endgültiges Löschen ────────────────────────────────────────────────

  test("AC-21, AC-22: Fällige Inhalte verschwinden samt Dateien, alles andere bleibt", async () => {
    const dueProject = await createProject({
      title: "Fällig",
      members: [[L, "projektleiter"]],
      chapters: 2,
      files: true,
    });
    const mixed = await createProject({
      title: "Gemischt",
      members: [[L, "projektleiter"]],
      chapters: 3,
      files: true,
    });
    const notDueProject = await createProject({
      title: "Nicht fällig",
      members: [[L, "projektleiter"]],
      chapters: 1,
      files: true,
    });

    await deleteProjectAs(tokenL, dueProject.id);
    await deleteProjectAs(tokenL, notDueProject.id);
    await deleteChapterAs(tokenL, mixed.chapters[0]);
    await deleteChapterAs(tokenL, mixed.chapters[1]);
    await setDue("trash_projects", "project_id", dueProject.id);
    await setDue("trash_chapters", "chapter_id", mixed.chapters[0]);

    await assertOnlyOwnItemsDue();
    const purge = await admin.rpc("trash_purge_due");
    expect(purge.error).toBeNull();
    expect(purge.data.projects).toBeGreaterThanOrEqual(1);
    expect(purge.data.chapters).toBeGreaterThanOrEqual(1);

    expect(await count("projects", "id", dueProject.id)).toBe(0);
    expect(await count("chapters", "project_id", dueProject.id)).toBe(0);
    expect(await count("trash_projects", "project_id", dueProject.id)).toBe(0);
    expect(await count("trash_chapters", "chapter_id", mixed.chapters[0])).toBe(0);
    expect(await count("trash_chapters", "chapter_id", mixed.chapters[1])).toBe(1);
    expect(await count("trash_projects", "project_id", notDueProject.id)).toBe(1);

    const result = await runRealFileCleanup([dueProject.id]);
    expect(result.projects.failed).toBe(0);
    expect(result.chapters.failed).toBe(0);

    for (const [bucket, file] of [
      ["chapter-heroes", `${dueProject.id}/${dueProject.chapters[0]}/bild.png`],
      ["chapter-heroes", `${dueProject.id}/${dueProject.chapters[1]}/bild.png`],
      ["project-covers", `${dueProject.id}/cover.png`],
      ["project-logos", `${dueProject.id}/logo.png`],
      ["exports", `${dueProject.id}/buch.pdf`],
      ["chapter-heroes", `${mixed.id}/${mixed.chapters[0]}/bild.png`],
    ]) {
      expect(await fileExists(bucket, file), `${bucket}/${file} muss weg sein`).toBe(false);
    }
    for (const [bucket, file] of [
      ["chapter-heroes", `${mixed.id}/${mixed.chapters[1]}/bild.png`],
      ["chapter-heroes", `${mixed.id}/${mixed.chapters[2]}/bild.png`],
      ["project-covers", `${mixed.id}/cover.png`],
      ["chapter-heroes", `${notDueProject.id}/${notDueProject.chapters[0]}/bild.png`],
      ["project-covers", `${notDueProject.id}/cover.png`],
    ]) {
      expect(await fileExists(bucket, file), `${bucket}/${file} muss bleiben`).toBe(true);
    }
    expect(await count("storage_chapter_cleanup_queue", "chapter_id", mixed.chapters[0])).toBe(0);
    expect(await count("storage_cleanup_queue", "project_id", dueProject.id)).toBe(0);
  });

  test("AC-20: Support kann vor Ablauf endgültig löschen", async () => {
    const early = await createProject({
      title: "DSGVO",
      members: [[L, "projektleiter"]],
      chapters: 2,
      files: true,
    });
    await deleteChapterAs(tokenL, early.chapters[0]);
    const chapterNow = await admin.rpc("trash_delete_chapter_now", { p_chapter_id: early.chapters[0] });
    expect(chapterNow.error).toBeNull();
    await deleteProjectAs(tokenL, early.id);
    const projectNow = await admin.rpc("trash_delete_project_now", { p_project_id: early.id });
    expect(projectNow.error).toBeNull();

    expect(await count("projects", "id", early.id)).toBe(0);
    const result = await runRealFileCleanup([early.id]);
    expect(result.projects.failed).toBe(0);
    expect(result.chapters.failed).toBe(0);
    expect(await fileExists("chapter-heroes", `${early.id}/${early.chapters[0]}/bild.png`)).toBe(false);
    expect(await fileExists("project-covers", `${early.id}/cover.png`)).toBe(false);
  });

  // ─── E: Konto-Löschen ──────────────────────────────────────────────────────

  test("AC-25, AC-27, AC-28: Konto-Löschen nimmt nur Einzelprojekte mit", async () => {
    const X = await createAccount("konto-x", "Xenia Konto");
    const Y = await createAccount("konto-y", "Yannick Konto");
    const xSession = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Nur für die Token von X: Das CAPTCHA läuft über die echte Anmeldeseite.
    const context = await pageL.context().browser()!.newContext();
    const page = await context.newPage();
    await signIn(page, X);
    const tokenX = accessToken(await context.cookies());
    await context.close();
    void xSession;

    const solo = await createProject({
      title: "Nur X",
      members: [[X, "projektleiter"]],
      chapters: 1,
      files: true,
    });
    const together = await createProject({
      title: "X und Y",
      members: [[X, "projektleiter"], [Y, "co_author"]],
      chapters: 2,
    });
    const activeShared = await createProject({
      title: "Aktiv X und Y",
      members: [[Y, "projektleiter"], [X, "co_author"]],
      chapters: 2,
    });
    await admin
      .from("chapter_contributors")
      .insert({ chapter_id: activeShared.chapters[0], user_id: X.id });

    await deleteProjectAs(tokenX, solo.id);
    await deleteProjectAs(tokenX, together.id);
    await deleteChapterAs(tokenX, activeShared.chapters[0]);
    expect(await count("trash_projects", "project_id", solo.id)).toBe(1);
    expect(await count("trash_projects", "project_id", together.id)).toBe(1);

    const overview = await admin.rpc("account_deletion_overview", { p_user_id: X.id, p_email: X.email });
    expect(overview.error).toBeNull();
    const listed = JSON.stringify(overview.data);
    expect(listed).not.toContain(solo.id);
    expect(listed).not.toContain(together.id);

    const prepared = await admin.rpc("prepare_account_deletion", {
      p_user_id: X.id,
      p_email: X.email,
      p_confirmed_delete: [],
      p_successors: {},
    });
    expect(prepared.error).toBeNull();
    expect(prepared.data.deletedProjectIds).toContain(solo.id);
    expect(prepared.data.deletedProjectIds).not.toContain(together.id);
    expect(prepared.data.deletedProjectIds).not.toContain(activeShared.id);

    const removed = await admin.auth.admin.deleteUser(X.id);
    expect(removed.error).toBeNull();
    accounts.splice(accounts.indexOf(X), 1);

    expect(await count("projects", "id", solo.id)).toBe(0);
    expect(await count("storage_cleanup_queue", "project_id", solo.id)).toBe(1);
    const result = await runRealFileCleanup([solo.id]);
    expect(result.projects.failed).toBe(0);
    expect(await fileExists("project-covers", `${solo.id}/cover.png`)).toBe(false);

    expect(await count("trash_projects", "project_id", together.id)).toBe(1);
    expect(await count("trash_project_members", "project_id", together.id)).toBe(1);
    const { data: entry } = await admin
      .from("trash_projects")
      .select("deleted_by, deleted_at")
      .eq("project_id", together.id)
      .single();
    expect(entry?.deleted_by).toBeNull();
    expect(entry?.deleted_at).toBeTruthy();

    const { data: chapterEntry } = await admin
      .from("trash_chapters")
      .select("deleted_by")
      .eq("chapter_id", activeShared.chapters[0])
      .single();
    expect(chapterEntry?.deleted_by).toBeNull();

    const noLead = await admin.rpc("trash_restore_project", { p_project_id: together.id });
    expect(noLead.error?.message).toContain("lead_required");
    const withLead = await admin.rpc("trash_restore_project", {
      p_project_id: together.id,
      p_new_lead: Y.id,
    });
    expect(withLead.error).toBeNull();
    const { data: project } = await admin
      .from("projects")
      .select("owner_id")
      .eq("id", together.id)
      .single();
    expect(project?.owner_id).toBe(Y.id);
  });

  // ─── Weitere Angriffswege ──────────────────────────────────────────────────

  test("AC-8 Red Team: Auch über GraphQL geht nichts am Papierkorb vorbei", async () => {
    const project = await createProject({
      title: "GraphQL",
      members: [[L, "projektleiter"]],
      chapters: 1,
    });
    const graphql = (query: string) =>
      fetch(`${supabaseUrl}/graphql/v1`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${tokenL}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

    await graphql(
      `mutation { deleteFromchaptersCollection(filter: { id: { eq: "${project.chapters[0]}" } }, atMost: 1) { affectedCount } }`,
    );
    const live = await count("chapters", "id", project.chapters[0]);
    const trashed = await count("trash_chapters", "chapter_id", project.chapters[0]);
    expect(live + trashed).toBe(1);

    await graphql(
      `mutation { deleteFromprojectsCollection(filter: { id: { eq: "${project.id}" } }, atMost: 1) { affectedCount } }`,
    );
    expect(await count("projects", "id", project.id)).toBe(1);
  });

  // ─── Behobene Bugs ─────────────────────────────────────────────────────────

  test("AC-16, BUG-1: Support erkennt eine später entfernte Person als Mitglied", async () => {
    const project = await createProject({
      title: "Streitfall",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: 1,
    });
    await deleteChapterAs(tokenL, project.chapters[0]);
    const removed = await rest(
      `project_members?project_id=eq.${project.id}&user_id=eq.${C.id}`,
      { method: "DELETE" },
      tokenL,
    );
    expect(removed.status).toBeLessThan(300);

    const { data: hits } = await admin.rpc("trash_find", { p_search: C.email });
    const hit = hits.find((row: { item_id: string }) => row.item_id === project.chapters[0]);
    expect(hit.member_emails).toContain(C.email);
  });

  test("BUG-1: Vor dem Löschen entfernte Autorin wird als Mitschreibende erkannt", async () => {
    const project = await createProject({
      title: "Streitfall davor",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: 1,
    });
    await admin.from("chapter_contributors").insert({ chapter_id: project.chapters[0], user_id: C.id });
    await rest(
      `project_members?project_id=eq.${project.id}&user_id=eq.${C.id}`,
      { method: "DELETE" },
      tokenL,
    );
    await deleteChapterAs(tokenL, project.chapters[0]);

    const { data: hits } = await admin.rpc("trash_find", { p_search: C.email });
    const hit = hits.find((row: { item_id: string }) => row.item_id === project.chapters[0]);
    expect(hit.member_emails ?? "").not.toContain(C.email);
    expect(hit.contributor_emails).toContain(C.email);
  });

  test("BUG-4: Umbenennen in einem alten Tab meldet das gelöschte Kapitel", async () => {
    const project = await createProject({
      title: "Alter Tab",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: 2,
    });
    await pageC.goto(`/projektuebersicht/${project.id}`);
    await expect(pageC.getByRole("button", { name: `Kapitel „Kapitel 1" umbenennen` })).toBeVisible();

    await deleteChapterAs(tokenL, project.chapters[0]);

    await pageC.getByRole("button", { name: `Kapitel „Kapitel 1" umbenennen` }).click();
    await pageC.getByLabel("Kapitelname").fill("Neuer Name");
    await pageC.getByRole("button", { name: "Speichern", exact: true }).click();

    await expect(pageC.getByText("Dieses Kapitel ist nicht mehr verfügbar.")).toBeVisible();
    await expect(pageC.getByRole("button", { name: /Neuer Name/ })).toHaveCount(0, { timeout: 10_000 });
    await expect(pageC.getByRole("button", { name: `Kapitel „Kapitel 2" löschen` })).toBeVisible();
    expect(await count("chapters", "id", project.chapters[0])).toBe(0);
  });

  test("BUG-5: Sortieren in einem alten Tab lädt die aktuelle Liste", async () => {
    const project = await createProject({
      title: "Alte Liste",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: 3,
    });
    await pageC.goto(`/projektuebersicht/${project.id}`);
    const list = pageC.getByRole("list", { name: "Kapitelreihenfolge" });
    await expect(list.getByRole("listitem")).toHaveCount(3);

    await deleteChapterAs(tokenL, project.chapters[1]);

    await pageC
      .getByLabel(/Kapitel 1: Kapitel 1 — zum Umsortieren ziehen/)
      .dragTo(list.getByRole("listitem").nth(2));
    await pageC.getByRole("button", { name: "Reihenfolge speichern" }).click();

    await expect(pageC.getByText("Die Kapitelliste hat sich inzwischen geändert.", { exact: false })).toBeVisible();
    await expect(pageC.getByText("Sicherheitsfehler")).toHaveCount(0);
    await expect(list.getByRole("listitem")).toHaveCount(2, { timeout: 10_000 });
    await expect(pageC.getByRole("button", { name: `Kapitel „Kapitel 2" löschen` })).toHaveCount(0);

    const { data: order } = await admin
      .from("chapters")
      .select("id, sort_order")
      .eq("project_id", project.id)
      .order("sort_order");
    expect(order?.map((row) => row.id)).toEqual([project.chapters[0], project.chapters[2]]);
  });

  test("BUG-2: Nach dem Konto-Löschen bleibt keine Nutzer-ID im Papierkorb", async () => {
    const Z = await createAccount("konto-z", "Zora Konto");
    const project = await createProject({
      title: "Beitrag",
      members: [[L, "projektleiter"], [Z, "co_author"]],
      chapters: 1,
    });
    await admin.from("chapter_contributors").insert({ chapter_id: project.chapters[0], user_id: Z.id });
    await deleteChapterAs(tokenL, project.chapters[0]);
    await admin.auth.admin.deleteUser(Z.id);
    accounts.splice(accounts.indexOf(Z), 1);

    expect(await count("trash_chapter_people", "user_id", Z.id)).toBe(0);
    expect(await count("trash_chapters", "chapter_id", project.chapters[0])).toBe(1);
    const restored = await admin.rpc("trash_restore_chapter", { p_chapter_id: project.chapters[0] });
    expect(restored.error).toBeNull();
  });

  // ─── Gleichzeitige Zugriffe ────────────────────────────────────────────────

  test("Race: Einladung und Projekt-Löschung gleichzeitig", async () => {
    let trashedRounds = 0;
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const project = await createProject({
        title: `Race Einladung ${round}`,
        members: [[L, "projektleiter"]],
        chapters: 0,
      });
      const [deleted] = await Promise.all([
        deleteProjectAs(tokenL, project.id),
        admin.from("project_members").insert({ project_id: project.id, user_id: O.id, role: "co_author" }),
      ]);
      expect(deleted.status).toBeLessThan(300);
      expect(await count("trash_projects", "project_id", project.id)).toBe(1);
      expect(await count("project_members", "project_id", project.id)).toBe(0);
      trashedRounds += 1;
      await admin.from("projects").delete().eq("id", project.id);
      projectIds.delete(project.id);
    }
    expect(trashedRounds).toBe(RACE_ROUNDS);
  });

  test("Race: Zwei Personen löschen dasselbe Kapitel", async () => {
    const project = await createProject({
      title: "Race Kapitel",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: RACE_ROUNDS,
    });
    for (const chapter of project.chapters) {
      const results = await Promise.all([
        deleteChapterAs(tokenL, chapter),
        deleteChapterAs(tokenC, chapter),
      ]);
      for (const result of results) expect(result.status).toBeLessThan(300);
      expect(await count("trash_chapters", "chapter_id", chapter)).toBe(1);
      expect(await count("chapters", "id", chapter)).toBe(0);
    }
  });

  test("Race: Autosave und Löschen desselben Kapitels", async () => {
    const project = await createProject({
      title: "Race Autosave",
      members: [[L, "projektleiter"], [C, "co_author"]],
      chapters: RACE_ROUNDS,
    });
    for (const chapter of project.chapters) {
      await Promise.all([
        rest(`chapters?id=eq.${chapter}`, { method: "PATCH", body: JSON.stringify({ title: "Neu" }) }, tokenC),
        deleteChapterAs(tokenL, chapter),
      ]);
      expect(await count("chapters", "id", chapter)).toBe(0);
      expect(await count("trash_chapters", "chapter_id", chapter)).toBe(1);
    }
  });

  test("Race, AC-24: Wiederherstellen und endgültiges Löschen gleichzeitig", async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const project = await createProject({
        title: `Race Purge ${round}`,
        members: [[L, "projektleiter"]],
        chapters: 1,
      });
      await deleteProjectAs(tokenL, project.id);
      await setDue("trash_projects", "project_id", project.id);
      await assertOnlyOwnItemsDue();

      await Promise.all([
        admin.rpc("trash_restore_project", { p_project_id: project.id }),
        admin.rpc("trash_purge_due"),
      ]);

      const exists = await count("projects", "id", project.id);
      const inTrash = await count("trash_projects", "project_id", project.id);
      const members = await count("project_members", "project_id", project.id);
      expect(inTrash).toBe(0);
      if (exists === 1) {
        expect(members).toBe(1);
        expect(await count("chapters", "project_id", project.id)).toBe(1);
        expect(await count("storage_cleanup_queue", "project_id", project.id)).toBe(0);
      } else {
        expect(members).toBe(0);
        await admin.from("storage_cleanup_queue").delete().eq("project_id", project.id);
      }
    }
  });

  test("Race: Lead löscht Projekt, während die andere Person ihr Konto löscht", async () => {
    for (let round = 0; round < 6; round += 1) {
      const leaver = await createAccount(`race-${round}`, `Race ${round}`);
      const project = await createProject({
        title: `Race Konto ${round}`,
        members: [[L, "projektleiter"], [leaver, "co_author"]],
        chapters: 1,
      });
      const [deleted, prepared] = await Promise.all([
        deleteProjectAs(tokenL, project.id),
        admin.rpc("prepare_account_deletion", {
          p_user_id: leaver.id,
          p_email: leaver.email,
          p_confirmed_delete: [],
          p_successors: {},
        }),
      ]);
      expect(deleted.status).toBeLessThan(300);
      expect(prepared.error).toBeNull();
      expect(prepared.data.deletedProjectIds).not.toContain(project.id);
      expect(await count("projects", "id", project.id)).toBe(1);
      expect(await count("trash_projects", "project_id", project.id)).toBe(1);
    }
  });
});
