import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEnvLocal, signIn, STAGE_HOST } from "./helpers/stage";

// PROJ-30 — Lade- und Fehlerverhalten mit einem temporären Konto auf Stage.
//
//   E2E_LOADING=1 npx playwright test tests/PROJ-30-ladezeiten.spec.ts --project=chromium --workers=1

const ENABLED = process.env.E2E_LOADING === "1";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const EMAIL = `e2e-proj30-${RUN_ID}@example.test`;
const PASSWORD = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
const PROJECT_TITLE = `E2E Ladezeiten ${RUN_ID}`;

let admin: SupabaseClient;
let userId = "";
let projectId = "";
let shortChapter = "";
let longChapter = "";
const SESSION_FILE = path.join(os.tmpdir(), `e2e-proj30-${RUN_ID}.json`);

test.use({ storageState: { cookies: [], origins: [] } });

const doc = (paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

const LONG_PARAGRAPH = "Damals gingen wir jeden Morgen gemeinsam den langen Weg durch das Dorf zur Schule. ".repeat(6);

async function chapterRow(id: string) {
  const { data, error } = await admin
    .from("chapters")
    .select("body, updated_at, page_count")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as { body: unknown; updated_at: string; page_count: number };
}

const bodyText = async (id: string) => JSON.stringify((await chapterRow(id)).body);

async function setBody(id: string, text: string) {
  const { error } = await admin.from("chapters").update({ body: doc([text]) }).eq("id", id);
  if (error) throw new Error(error.message);
}

const editorUrl = (id: string) => `/projektuebersicht/${projectId}/kapiteleditor/${id}`;

async function openEditor(page: Page, id: string) {
  await page.goto(editorUrl(id));
  await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 15_000 });
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

async function toOverview(page: Page) {
  await page.getByRole("link", { name: "Zurück zur Projektübersicht" }).click();
  await page.waitForURL(`**/projektuebersicht/${projectId}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

const slowSaves = (page: Page, ms: number) =>
  page.route("**/projektuebersicht/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue().catch(() => undefined);
  });

async function newChapter(title: string, body: unknown, extra: Record<string, unknown> = {}) {
  const { data: last } = await admin
    .from("chapters")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const { data, error } = await admin
    .from("chapters")
    .insert({
      project_id: projectId,
      title,
      sort_order: (last?.sort_order ?? 0) + 1,
      chapter_origin: "custom",
      body,
      ...extra,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "kein Kapitel");
  return data.id as string;
}

async function delayNavigations(page: Page, ms: number) {
  await page.route("**/*_rsc=*", async (route) => {
    const headers = route.request().headers();
    if (!headers["next-router-prefetch"]) await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });
}

test.describe("PROJ-30 — Ladezeiten", () => {
  test.skip(!ENABLED, "Nur mit E2E_LOADING=1, legt temporäre Daten auf Stage an.");
  test.describe.configure({ mode: "serial" });
  // PROJ-31: Einmal anmelden und die Sitzung für alle Tests wiederverwenden.
  test.use({ storageState: SESSION_FILE });

  test.beforeAll(async ({ browser }) => {
    const env = readEnvLocal();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    if (new URL(url).host !== STAGE_HOST) throw new Error("Diese Suite läuft nur gegen Stage.");
    admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Test Ladezeiten" },
    });
    if (userError || !created.user) throw new Error(userError?.message ?? "kein Konto");
    userId = created.user.id;
    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ title: PROJECT_TITLE, owner_id: userId })
      .select("id")
      .single();
    if (projectError || !project) throw new Error(projectError?.message ?? "kein Projekt");
    projectId = project.id as string;
    await admin.from("project_access").insert({
      project_id: projectId,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await admin.from("project_members").insert({ project_id: projectId, user_id: userId, role: "projektleiter" });
    const { data: chapters, error: chapterError } = await admin
      .from("chapters")
      .insert([
        {
          project_id: projectId,
          title: "Kurzes Kapitel",
          sort_order: 0,
          chapter_origin: "custom",
          body: doc(["Alter Text mit Donaudampfschifffahrtsgesellschaft."]),
        },
        {
          project_id: projectId,
          title: "Langes Kapitel",
          sort_order: 1,
          chapter_origin: "custom",
          body: doc(Array.from({ length: 110 }, () => LONG_PARAGRAPH)),
        },
      ])
      .select("id, title");
    if (chapterError || !chapters) throw new Error(chapterError?.message ?? "keine Kapitel");
    shortChapter = chapters.find((c) => c.title === "Kurzes Kapitel")!.id as string;
    longChapter = chapters.find((c) => c.title === "Langes Kapitel")!.id as string;

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await signIn(await context.newPage(), { email: EMAIL, password: PASSWORD });
    await context.storageState({ path: SESSION_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    fs.rmSync(SESSION_FILE, { force: true });
    if (!admin) return;
    if (projectId) {
      await admin.from("mail_log").delete().eq("project_id", projectId);
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", projectId);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", projectId);
      await admin.from("projects").delete().eq("id", projectId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("AC-26: Bloßes Öffnen schreibt keinen Text zurück", async ({ page }) => {
    const before = await chapterRow(shortChapter);
    await openEditor(page, shortChapter);
    await page.locator('.a5-stack[data-ready="1"]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(2_600);
    const after = await chapterRow(shortChapter);
    expect(after.body).toEqual(before.body);
    expect(after.updated_at).toBe(before.updated_at);
  });

  test("AC-22, AC-26: Zurück-Taste zeigt den gespeicherten Text und behält ihn", async ({ page }) => {
    await openEditor(page, shortChapter);
    await typeAtEnd(page, " NEU");
    await expect.poll(() => bodyText(shortChapter), { timeout: 20_000 }).toContain("NEU");
    await toOverview(page);
    await page.goBack();
    await page.waitForURL(`**${editorUrl(shortChapter)}`);
    await expect(page.locator(".ProseMirror").first()).toContainText("NEU", { timeout: 10_000 });
    await typeAtEnd(page, " DANACH");
    await expect.poll(() => bodyText(shortChapter), { timeout: 20_000 }).toContain("DANACH");
    expect(await bodyText(shortChapter)).toContain("NEU");
  });

  test("AC-17, AC-26: Zurück zeigt den Stand einer anderen Person", async ({ page }) => {
    await openEditor(page, shortChapter);
    await toOverview(page);
    await setBody(shortChapter, "Text von einer anderen Person");
    await page.goBack();
    await page.waitForURL(`**${editorUrl(shortChapter)}`);
    await expect(page.locator(".ProseMirror").first()).toContainText("anderen Person", {
      timeout: 10_000,
    });
    await page.waitForTimeout(2_600);
    expect(await bodyText(shortChapter)).toContain("anderen Person");
  });

  test("AC-15, AC-16: Zurück zur Übersicht zeigt die aktuelle Wortzahl", async ({ page }) => {
    await setBody(shortChapter, "eins zwei drei");
    await page.goto(`/projektuebersicht/${projectId}`);
    await expect(page.getByText(/3 Wörter/).first()).toBeVisible();
    await page.getByRole("link", { name: "Bearbeiten", exact: true }).first().click();
    await page.waitForURL(`**${editorUrl(shortChapter)}`);
    await page.locator('.a5-stack[data-visible="1"]').waitFor();
    await setBody(shortChapter, "eins zwei drei vier fünf");
    await page.goBack();
    await page.waitForURL(`**/projektuebersicht/${projectId}`);
    await expect(page.getByText(/5 Wörter/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("AC-1 bis AC-4: Die Ladeansicht erscheint sofort und ruhig", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await delayNavigations(page, 1_500);
    const link = page.locator(`a[href="/projektuebersicht/${projectId}"]:visible`).first();
    const started = Date.now();
    await link.click();
    const hint = page.getByRole("status").filter({ hasText: "Wird geladen" }).first();
    await expect(hint).toBeVisible({ timeout: 1_000 });
    expect(Date.now() - started).toBeLessThan(600);
    expect(await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    const animated = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main *")).filter((el) => {
        const name = getComputedStyle(el).animationName;
        return name !== "none" && name !== "loading-appear";
      }).length,
    );
    expect(animated).toBe(0);
    // Die bisherige Seite bleibt unsichtbar im Layout, gezeigt wird kein Projekttitel.
    await expect(page.getByText(PROJECT_TITLE).locator("visible=true")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_TITLE })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("AC-8: Die Ladeansicht passt auf kleine Bildschirme", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await delayNavigations(page, 1_500);
    await page.locator(`a[href="/projektuebersicht/${projectId}"]:visible`).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Wird geladen" }).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("AC-10: Ein langes Kapitel ist schnell sichtbar und behält seine Seitenzahl", async ({ page }) => {
    await page.goto(`/projektuebersicht/${projectId}`);
    await page.waitForLoadState("networkidle");
    const link = page.locator(`a[href="${editorUrl(longChapter)}"]:visible`).first();
    const started = Date.now();
    await link.click();
    await page.locator('.a5-stack[data-visible="1"]').waitFor({ timeout: 15_000 });
    const visibleAfter = Date.now() - started;
    const pagesAtReveal = await page.locator(".a5-page-frame").count();
    await page.locator('.a5-stack[data-ready="1"]').waitFor({ timeout: 15_000 });
    const pagesSettled = await page.locator(".a5-page-frame").count();
    console.log(`LONG ${JSON.stringify({ visibleAfter, pagesAtReveal, pagesSettled })}`);
    expect(pagesSettled).toBeGreaterThan(20);
    expect(pagesAtReveal).toBe(pagesSettled);
    expect(visibleAfter).toBeLessThan(2_000);
  });

  test("AC-22, AC-26: Langsames Speichern, sofort wieder geöffnet, kein Text geht verloren", async ({ page }) => {
    const id = await newChapter("Langsames Kapitel", doc(["Grundtext"]));
    await openEditor(page, id);
    await slowSaves(page, 2_500);
    await typeAtEnd(page, " SCHNELL");
    await toOverview(page);
    await page.locator(`a[href="${editorUrl(id)}"]`).click();
    await page.waitForURL(`**${editorUrl(id)}`);
    await expect(page.locator(".ProseMirror").first()).toContainText("SCHNELL", { timeout: 15_000 });
    await page.unroute("**/projektuebersicht/**");
    await page.locator('.a5-stack[data-visible="1"]').waitFor();
    await typeAtEnd(page, " DANACH");
    await expect.poll(() => bodyText(id), { timeout: 20_000 }).toContain("DANACH");
    expect(await bodyText(id)).toContain("SCHNELL");
  });

  test("AC-15: Nach schnellem Verlassen zeigt die Übersicht die neue Wortzahl", async ({ page }) => {
    const title = "Wortzahl-Kapitel";
    const id = await newChapter(title, doc(["eins zwei"]));
    await openEditor(page, id);
    await typeAtEnd(page, " drei vier");
    await toOverview(page);
    const row = page.locator('[role="listitem"]', { hasText: title }).first();
    await expect(row).toContainText("4 Wörter", { timeout: 10_000 });
  });

  test("AC-21: Ein Kapitel auf dem Handy zu öffnen ändert die Seitenzahl nicht", async ({ page }) => {
    const id = await newChapter("Handy-Kapitel", doc(Array.from({ length: 40 }, () => LONG_PARAGRAPH)), {
      page_count: 15,
    });
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(editorUrl(id));
    await expect(page.getByText("Editor auf dem Smartphone nicht verfügbar")).toBeVisible();
    await page.waitForTimeout(8_500);
    expect((await chapterRow(id)).page_count).toBe(15);
  });

  test("Cover: Eine Änderung direkt vor dem Verlassen bleibt erhalten", async ({ page }) => {
    const subtitle = `Eilig ${RUN_ID}`;
    await page.goto(`/projektuebersicht/${projectId}/cover-bearbeiten`);
    await page.getByRole("heading", { level: 1, name: /Cover bearbeiten/ }).waitFor();
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Untertitel/i).first().fill(subtitle);
    await toOverview(page);
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("project_covers")
            .select("metadata")
            .eq("project_id", projectId)
            .maybeSingle();
          return JSON.stringify(data?.metadata ?? {});
        },
        { timeout: 10_000 },
      )
      .toContain(subtitle);
  });

  test("Nicht gefunden: deutscher Text und echter 404-Status", async ({ page }) => {
    const response = await page.goto(`/projektuebersicht/${crypto.randomUUID()}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Diese Seite gibt es nicht" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Startseite" })).toBeVisible();
  });

  test("Ohne Verbindung bleibt die Seite stehen und erklärt es", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await expect(page.getByRole("alert").filter({ hasText: "nicht mit dem Internet" })).toBeVisible();
    await page.locator(`a[href="/projektuebersicht/${projectId}"]:visible`).first().click();
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe("/");
    await context.setOffline(false);
    await expect(page.getByRole("alert").filter({ hasText: "nicht mit dem Internet" })).toHaveCount(0);
  });

  test("Öffentliche Seiten haben weder Ladeansicht noch Offline-Hinweis", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/anmelden");
    await context.setOffline(true);
    await page.waitForTimeout(200);
    await expect(page.getByText("nicht mit dem Internet")).toHaveCount(0);
    await expect(page.getByText("Wird geladen")).toHaveCount(0);
    await context.setOffline(false);
    await context.close();
  });
});
