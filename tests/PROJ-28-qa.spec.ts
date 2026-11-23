import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { waitForPage } from "./helpers/page-ready";

// PROJ-28 — QA gegen die echte Stage-Datenbank: Wege am Lesemodus vorbei und
// der Zustand von Personen, deren letztes Projekt automatisch entfernt wurde.
//
//   E2E_RETENTION=1 npx playwright test tests/PROJ-28-qa.spec.ts --project=chromium --workers=1
//
// Nur eigene temporäre Konten. Die Cron-Route wird nicht aufgerufen, es werden
// keine Mails ausgelöst. Ist ein fremdes Projekt fällig, bricht die Suite ab.

const ENABLED = process.env.E2E_RETENTION === "1";
const STAGE_HOST = "kdjhxqitfxnsavhiafdn.supabase.co";
const TEST_EMAIL_PREFIX = "e2e-loeschlauf-qa-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_PREFIX = `cs_e2e_loeschlauf_qa_${RUN_ID}_`;
const DAY_MS = 86_400_000;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAFAAH/e+m+7wAAAABJRU5ErkJggg==",
  "base64",
);

type Account = { id: string; email: string; password: string; name: string };
type Role = "projektleiter" | "co_author";
type Project = { id: string; title: string; chapters: string[]; files: Array<[string, string]> };

let supabaseUrl: string;
let anonKey: string;
let admin: SupabaseClient;
let L: Account;
let C: Account;
let R: Account;
let U: Account;
let N: Account;
let expired: Project;
let deletable: Project;
let solo: Project;
let tokenL: string;
let tokenC: string;
let tokenU: string;
const contexts: BrowserContext[] = [];
let pageL: Page;
let pageU: Page;
let pageN: Page;

const accounts: Account[] = [];
const projects: Project[] = [];

function readEnvLocal(): Record<string, string> {
  const values: Record<string, string> = {};
  const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function createAccount(label: string): Promise<Account> {
  const email = `${TEST_EMAIL_PREFIX}${label}-${RUN_ID}@example.test`;
  const password = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
  const name = `Test ${label}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const account = { id: data.user.id, email, password, name };
  accounts.push(account);
  return account;
}

async function upload(bucket: string, file: string): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(file, PNG, { contentType: "image/png" });
  if (error) throw new Error(`${bucket}: ${error.message}`);
}

async function createProject(
  label: string,
  expiryOffsetDays: number,
  members: Array<[Account, Role]>,
  chapterCount = 3,
): Promise<Project> {
  const id = crypto.randomUUID();
  const title = `${label} ${RUN_ID}`;
  const project: Project = { id, title, chapters: [], files: [] };
  projects.push(project);
  const inserted = await admin.from("projects").insert({ id, title, owner_id: members[0][0].id });
  if (inserted.error) throw new Error(inserted.error.message);
  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + expiryOffsetDays * DAY_MS).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);
  const payment = await admin.from("payments").insert({
    project_id: id,
    user_id: members[0][0].id,
    stripe_session_id: `${SESSION_PREFIX}${id}`,
    type: "initial_portal_access",
    amount_cents: 24900,
    currency: "eur",
    status: "completed",
  });
  if (payment.error) throw new Error(payment.error.message);
  for (const [index, [member, role]] of members.entries()) {
    const row = await admin.from("project_members").insert({
      project_id: id,
      user_id: member.id,
      role,
      created_at: new Date(Date.now() + index * 1000).toISOString(),
    });
    if (row.error) throw new Error(row.error.message);
  }
  for (let index = 0; index < chapterCount; index += 1) {
    const chapterId = crypto.randomUUID();
    const file = `${id}/${chapterId}/bild.png`;
    await upload("chapter-heroes", file);
    project.files.push(["chapter-heroes", file]);
    const chapter = await admin.from("chapters").insert({
      id: chapterId,
      project_id: id,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      page_count: 1,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Erinnerung" }] }] },
    });
    if (chapter.error) throw new Error(chapter.error.message);
    project.chapters.push(chapterId);
  }
  const cover = `${id}/cover.png`;
  await upload("project-covers", cover);
  project.files.push(["project-covers", cover]);
  const logo = `${id}/logo.png`;
  await upload("project-logos", logo);
  project.files.push(["project-logos", logo]);
  const coverRow = await admin.from("project_covers").insert({ project_id: id, image_url: cover });
  if (coverRow.error) throw new Error(coverRow.error.message);
  return project;
}

async function signIn(context: BrowserContext, account: Account): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/anmelden");
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
              ?.value.length ?? 0,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/anmelden"), { timeout: 45_000 });
  return page;
}

function accessToken(cookies: Array<{ name: string; value: string }>): string {
  const parts = cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value)
    .join("");
  const raw = parts.startsWith("base64-")
    ? Buffer.from(parts.slice("base64-".length), "base64").toString("utf8")
    : decodeURIComponent(parts);
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

const asUser = (token: string): SupabaseClient =>
  createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

async function fileExists(bucket: string, file: string): Promise<boolean> {
  const folder = file.slice(0, file.lastIndexOf("/"));
  const name = file.slice(file.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []).some((entry) => entry.name === name);
}

async function chapterIntact(id: string): Promise<boolean> {
  const live = await admin.from("chapters").select("id").eq("id", id).maybeSingle();
  const trash = await admin.from("trash_chapters").select("chapter_id").eq("chapter_id", id).maybeSingle();
  return live.data !== null && trash.data === null;
}

async function runRetention(): Promise<void> {
  const own = new Set(projects.map((project) => project.id));
  const due = await admin.rpc("retention_due");
  if (due.error) throw new Error(due.error.message);
  for (const row of (due.data ?? []) as Array<{ project_id: string }>) {
    if (!own.has(row.project_id)) throw new Error("Ein fremdes Projekt wäre fällig, der Testlauf bricht ab.");
  }
  const moved = await admin.rpc("retention_move_due");
  if (moved.error) throw new Error(moved.error.message);
}

test.describe("PROJ-28 — QA (nur Stage)", () => {
  test.skip(!ENABLED, "Legt echte Testdaten an, nur mit E2E_RETENTION=1");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const env = readEnvLocal();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (new URL(supabaseUrl).host !== STAGE_HOST) throw new Error("Diese Suite läuft nur gegen Stage.");
    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    L = await createAccount("leitung");
    C = await createAccount("co");
    R = await createAccount("raus");
    U = await createAccount("allein");
    N = await createAccount("neu");
    expired = await createProject("Lesemodus", -5, [[L, "projektleiter"], [C, "co_author"], [R, "co_author"]]);
    deletable = await createProject("Wegdamit", -5, [[L, "projektleiter"]], 1);
    solo = await createProject("Einzeln", -100, [[U, "projektleiter"]], 1);

    const open = async (account: Account) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      contexts.push(context);
      const page = await signIn(context, account);
      return { page, token: accessToken(await context.cookies()) };
    };
    const lead = await open(L);
    pageL = lead.page;
    tokenL = lead.token;
    tokenC = (await open(C)).token;
    const alone = await open(U);
    pageU = alone.page;
    tokenU = alone.token;
    pageN = (await open(N)).page;
  });

  test.afterAll(async () => {
    for (const context of contexts) await context.close();
    if (!admin) return;
    await admin.from("payments").delete().like("stripe_session_id", `${SESSION_PREFIX}%`);
    for (const project of projects) {
      await admin.from("projects").delete().eq("id", project.id);
      for (const bucket of ["chapter-heroes", "project-covers", "project-logos"]) {
        const files = project.files.filter(([name]) => name === bucket).map(([, file]) => file);
        if (files.length > 0) await admin.storage.from(bucket).remove(files);
      }
    }
    const ids = projects.map((project) => project.id);
    if (ids.length > 0) await admin.from("storage_cleanup_queue").delete().in("project_id", ids);
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  test("AC-6, AC-8: Direkte Löschaufrufe ändern im Lesemodus nichts", async () => {
    const clientC = asUser(tokenC);
    const clientL = asUser(tokenL);

    await clientC.from("chapters").delete().eq("id", expired.chapters[0]);
    expect.soft(await chapterIntact(expired.chapters[0]), "Co-Autor löscht Kapitel per API").toBe(true);
    await clientL.from("chapters").delete().eq("id", expired.chapters[1]);
    expect.soft(await chapterIntact(expired.chapters[1]), "Projektleitung löscht Kapitel per API").toBe(true);

    for (const [bucket, file] of expired.files) {
      await clientC.storage.from(bucket).remove([file]);
      expect.soft(await fileExists(bucket, file), `Co-Autor löscht Datei in ${bucket}`).toBe(true);
    }

    await clientC.from("project_covers").delete().eq("project_id", expired.id);
    const cover = await admin.from("project_covers").select("project_id").eq("project_id", expired.id);
    expect.soft(cover.data?.length, "Cover-Eintrag gelöscht").toBe(1);

    await clientC.from("project_members").update({ role: "projektleiter" }).eq("user_id", C.id).eq("project_id", expired.id);
    const role = await admin.from("project_members").select("role").eq("user_id", C.id).eq("project_id", expired.id).single();
    expect.soft(role.data?.role, "Co-Autor macht sich zur Leitung").toBe("co_author");

    const before = await admin.from("project_access").select("expires_at").eq("project_id", expired.id).single();
    await clientL.from("project_access").update({ expires_at: new Date(Date.now() + 365 * DAY_MS).toISOString() }).eq("project_id", expired.id);
    const after = await admin.from("project_access").select("expires_at").eq("project_id", expired.id).single();
    expect.soft(after.data?.expires_at, "Ablaufdatum selbst verschoben").toBe(before.data?.expires_at);

    const trashRead = await clientL.from("trash_projects").select("project_id");
    expect.soft(trashRead.error !== null || (trashRead.data ?? []).length === 0, "Papierkorb lesbar").toBe(true);
  });

  test("AC-7: Mitglied entfernen funktioniert im Lesemodus", async () => {
    await pageL.goto(`/projektuebersicht/${expired.id}`);
    await waitForPage(pageL);
    await pageL.getByRole("button", { name: new RegExp(`Mitglied .${R.name}. entfernen`) }).click();
    await pageL.getByRole("button", { name: "Endgültig entfernen" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin.from("project_members").select("id").eq("project_id", expired.id).eq("user_id", R.id);
        return data?.length;
      })
      .toBe(0);
  });

  test("AC-7: Projekt löschen funktioniert im Lesemodus", async () => {
    await pageL.goto("/");
    await waitForPage(pageL);
    const card = pageL.getByRole("link", { name: new RegExp(`Projekt .${deletable.title}. öffnen`) });
    await card.hover();
    await pageL.getByRole("button", { name: new RegExp(`Projekt .${deletable.title}. löschen`) }).click({ force: true });
    await pageL.getByRole("button", { name: "Weiter zur Bestätigung" }).click();
    const input = pageL.locator('input[placeholder]').last();
    await input.fill((await input.getAttribute("placeholder")) ?? "");
    await pageL.getByRole("dialog").getByRole("button", { name: /löschen/i }).last().click();
    await expect
      .poll(async () => {
        const { data } = await admin.from("trash_projects").select("reason").eq("project_id", deletable.id).maybeSingle();
        return data?.reason;
      })
      .toBe("customer");
  });

  test("Edge: Eine offene Einladung lässt sich im Lesemodus annehmen", async () => {
    const token = crypto.randomBytes(32).toString("hex");
    const invitation = await admin.from("invitations").insert({
      project_id: expired.id,
      email: N.email,
      role: "co_author",
      token,
      expires_at: new Date(Date.now() + 5 * DAY_MS).toISOString(),
      created_by: L.id,
    });
    expect(invitation.error).toBeNull();

    await pageN.goto(`/einladung/${token}`);
    await pageN.getByRole("button", { name: /annehmen/i }).click();
    await pageN.waitForURL(new RegExp(`/projektuebersicht/${expired.id}`), { timeout: 20_000 });
    await expect(pageN.getByText(/Abgelaufen am \d{2}\. \p{L}+ \d{4}/u)).toBeVisible();
    await expect(pageN.getByRole("button", { name: "Eigenes Kapitel" }).first()).toBeDisabled();
  });

  test("AC-15: Nach Tag 90 sind Projekt, Kapitel und Dateien für das Mitglied weg", async () => {
    await runRetention();
    const client = asUser(tokenU);

    for (const table of ["project_access", "project_covers", "chapters"]) {
      const { data } = await client.from(table).select("project_id").eq("project_id", solo.id);
      expect.soft(data ?? [], `${table} noch lesbar`).toEqual([]);
    }
    const project = await client.from("projects").select("id").eq("id", solo.id);
    expect.soft(project.data ?? [], "Projekt noch lesbar").toEqual([]);
    const [bucket, file] = solo.files[0];
    const signed = await client.storage.from(bucket).createSignedUrl(file, 60);
    expect.soft(signed.data?.signedUrl, "Datei noch abrufbar").toBeUndefined();
  });

  test("AC-7: Nach Tag 90 erreicht die Person weiter ihr Konto und kann es löschen", async () => {
    await pageU.goto("/persoenlicher-bereich");
    await pageU.waitForLoadState("domcontentloaded");
    expect.soft(new URL(pageU.url()).pathname, "Direkter Aufruf des Kontos").toBe("/persoenlicher-bereich");

    await pageU.goto("/");
    await pageU.waitForURL(/onboarding/, { timeout: 20_000 });
    await expect
      .soft(pageU.getByRole("link", { name: "Zum persönlichen Bereich" }), "Link zum Konto im Onboarding")
      .toBeVisible({ timeout: 5_000 });
  });
});
