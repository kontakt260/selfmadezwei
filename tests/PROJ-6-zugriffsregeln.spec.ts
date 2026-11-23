import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// PROJ-6 G6, G14, G15 — Zugriffsregeln direkt gegen Stage-API und Dateispeicher.
//
// Die Suite legt temporäre Konten und Projekte an und läuft deshalb nur mit
// `E2E_ACCESS_RULES=1` und nur gegen Stage:
//
//   E2E_ACCESS_RULES=1 npx playwright test tests/PROJ-6-zugriffsregeln.spec.ts --project=chromium
//
// Das QA-Konto wird nicht angefasst, es werden keine Mails ausgelöst.

const ENABLED = process.env.E2E_ACCESS_RULES === "1";
const STAGE_HOST = "kdjhxqitfxnsavhiafdn.supabase.co";
const TEST_EMAIL_PREFIX = "e2e-regeln-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const BUCKETS = ["chapter-heroes", "project-covers", "project-logos"] as const;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAFAAH/e+m+7wAAAABJRU5ErkJggg==",
  "base64",
);

type Account = { id: string; email: string; password: string };
type Role = "projektleiter" | "co_author";
type TestProject = { id: string; title: string; chapter: string };

let admin: SupabaseClient;
let supabaseUrl = "";
let anonKey = "";
let L: Account;
let C: Account;
let O: Account;
let contextL: BrowserContext | undefined;
let contextC: BrowserContext | undefined;
let contextO: BrowserContext | undefined;
let pageC: Page;
let pageO: Page;
let tokenL = "";
let tokenC = "";
let tokenO = "";

const accounts: Account[] = [];
const projectIds = new Set<string>();
const uploaded: Array<{ bucket: string; path: string }> = [];

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
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const account = { id: data.user.id, email, password };
  accounts.push(account);
  return account;
}

async function createProject(title: string, members: Array<[Account, Role]>): Promise<TestProject> {
  const id = crypto.randomUUID();
  const chapter = crypto.randomUUID();
  const fullTitle = `${title} ${RUN_ID}`;
  projectIds.add(id);

  const project = await admin.from("projects").insert({ id, title: fullTitle, owner_id: members[0][0].id });
  if (project.error) throw new Error(project.error.message);
  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + 100 * DAY_MS).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);
  for (const [member, role] of members) {
    const row = await admin.from("project_members").insert({ project_id: id, user_id: member.id, role });
    if (row.error) throw new Error(row.error.message);
  }
  const inserted = await admin.from("chapters").insert({
    id: chapter,
    project_id: id,
    title: "Original",
    sort_order: 0,
    body: { type: "doc", content: [] },
  });
  if (inserted.error) throw new Error(inserted.error.message);

  for (const bucket of BUCKETS) {
    const file = fileIn(bucket, id, chapter, "original.png");
    const { error } = await admin.storage.from(bucket).upload(file, PNG, { contentType: "image/png" });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    uploaded.push({ bucket, path: file });
  }
  return { id, title: fullTitle, chapter };
}

const fileIn = (bucket: string, projectId: string, chapterId: string, name: string) =>
  bucket === "chapter-heroes" ? `${projectId}/${chapterId}/${name}` : `${projectId}/${name}`;

const setExpiry = async (projectId: string, offsetDays: number) => {
  const { error } = await admin
    .from("project_access")
    .update({ expires_at: new Date(Date.now() + offsetDays * DAY_MS).toISOString() })
    .eq("project_id", projectId);
  expect(error).toBeNull();
};

async function signIn(page: Page, account: Account): Promise<void> {
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
}

function accessToken(cookies: Array<{ name: string; value: string }>): string {
  const parts = cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value)
    .join("");
  const raw = parts.startsWith("base64-")
    ? Buffer.from(parts.slice("base64-".length), "base64url").toString("utf8")
    : decodeURIComponent(parts);
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

function rest(pathname: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

const asUser = (token: string): SupabaseClient =>
  createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

/** Blockiert heißt: Fehler oder keine einzige geänderte Zeile. */
async function expectNoChange(response: Response): Promise<void> {
  if (response.status >= 400) return;
  expect(await response.json()).toEqual([]);
}

async function fileExists(bucket: string, file: string): Promise<boolean> {
  const folder = file.slice(0, file.lastIndexOf("/"));
  const name = file.slice(file.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []).some((entry) => entry.name === name);
}

test.describe("PROJ-6 — Zugriffsregeln (nur Stage)", () => {
  test.skip(!ENABLED, "Legt echte Testdaten an, nur mit E2E_ACCESS_RULES=1");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    const env = readEnvLocal();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (new URL(supabaseUrl).host !== STAGE_HOST) throw new Error("Diese Suite läuft nur gegen Stage.");
    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    L = await createAccount("leitung");
    C = await createAccount("co");
    O = await createAccount("aussen");

    contextL = await browser.newContext();
    contextC = await browser.newContext();
    contextO = await browser.newContext();
    const pageL = await contextL.newPage();
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
      for (const bucket of BUCKETS) {
        const { data: top } = await admin.storage.from(bucket).list(id, { limit: 100 });
        for (const entry of top ?? []) {
          if (entry.id) {
            uploaded.push({ bucket, path: `${id}/${entry.name}` });
          } else {
            const { data: nested } = await admin.storage.from(bucket).list(`${id}/${entry.name}`, { limit: 100 });
            for (const file of nested ?? []) uploaded.push({ bucket, path: `${id}/${entry.name}/${file.name}` });
          }
        }
      }
      await admin.from("projects").delete().eq("id", id);
    }
    for (const bucket of BUCKETS) {
      const files = [...new Set(uploaded.filter((f) => f.bucket === bucket).map((f) => f.path))];
      if (files.length > 0) await admin.storage.from(bucket).remove(files);
    }
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  let project: TestProject;

  test("Aktives Projekt: Mitglieder können wie bisher schreiben", async () => {
    project = await createProject("Regeln", [[L, "projektleiter"], [C, "co_author"]]);

    const chapter = await rest(
      `chapters?id=eq.${project.chapter}`,
      { method: "PATCH", body: JSON.stringify({ title: "Aktiv" }) },
      tokenC,
    );
    expect(chapter.status).toBe(200);
    expect(await chapter.json()).toHaveLength(1);

    for (const bucket of BUCKETS) {
      const file = fileIn(bucket, project.id, project.chapter, "aktiv.png");
      uploaded.push({ bucket, path: file });
      const { error } = await asUser(tokenC).storage.from(bucket).upload(file, PNG, { contentType: "image/png" });
      expect(error, bucket).toBeNull();
    }
  });

  test("G6: Abgelaufenes Projekt lässt sich über die API nicht mehr ändern", async () => {
    await setExpiry(project.id, -1);

    await expectNoChange(
      await rest(`chapters?id=eq.${project.chapter}`, { method: "PATCH", body: JSON.stringify({ title: "Hack" }) }, tokenC),
    );
    await expectNoChange(
      await rest(
        "chapters",
        { method: "POST", body: JSON.stringify({ project_id: project.id, title: "Hack", sort_order: 5 }) },
        tokenC,
      ),
    );
    await expectNoChange(
      await rest(`projects?id=eq.${project.id}`, { method: "PATCH", body: JSON.stringify({ title: "Hack" }) }, tokenC),
    );
    await expectNoChange(
      await rest("project_covers", { method: "POST", body: JSON.stringify({ project_id: project.id }) }, tokenC),
    );
    await expectNoChange(
      await rest(
        "invitations",
        {
          method: "POST",
          body: JSON.stringify({
            project_id: project.id,
            email: `hack-${RUN_ID}@example.test`,
            role: "co_author",
            token: crypto.randomBytes(24).toString("hex"),
            is_gift: false,
            expires_at: new Date(Date.now() + DAY_MS).toISOString(),
          }),
        },
        tokenL,
      ),
    );

    const { data: chapter } = await admin.from("chapters").select("title").eq("id", project.chapter).single();
    expect(chapter?.title).toBe("Aktiv");
    const { data: row } = await admin.from("projects").select("title").eq("id", project.id).single();
    expect(row?.title).toBe(project.title);
    const { count: chapters } = await admin
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    expect(chapters).toBe(1);
    const { count: covers } = await admin
      .from("project_covers")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    expect(covers).toBe(0);
    const { count: invitations } = await admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    expect(invitations).toBe(0);
  });

  test("G6: Im echten Speicher sind Upload, Überschreiben und Upload-Link gesperrt", async () => {
    for (const bucket of BUCKETS) {
      const storage = asUser(tokenC).storage.from(bucket);
      const blocked = fileIn(bucket, project.id, project.chapter, "abgelaufen.png");
      const original = fileIn(bucket, project.id, project.chapter, "original.png");
      uploaded.push({ bucket, path: blocked });

      const upload = await storage.upload(blocked, PNG, { contentType: "image/png" });
      expect(upload.error, `${bucket}: Upload`).not.toBeNull();
      expect(await fileExists(bucket, blocked)).toBe(false);

      const overwrite = await storage.update(original, PNG, { contentType: "image/png" });
      expect(overwrite.error, `${bucket}: Überschreiben`).not.toBeNull();

      const moved = await storage.move(original, blocked);
      expect(moved.error, `${bucket}: Verschieben`).not.toBeNull();
      expect(await fileExists(bucket, original)).toBe(true);

      const signed = await storage.createSignedUploadUrl(blocked);
      if (!signed.error && signed.data) {
        const viaLink = await storage.uploadToSignedUrl(blocked, signed.data.token, PNG, {
          contentType: "image/png",
        });
        expect(viaLink.error, `${bucket}: Upload-Link`).not.toBeNull();
      }
      expect(await fileExists(bucket, blocked), `${bucket}: Datei darf nicht entstehen`).toBe(false);
    }
  });

  test("G6: Lesen bleibt möglich, die Übersicht bietet die Verlängerung an", async () => {
    const read = await rest(`chapters?select=title&id=eq.${project.chapter}`, { method: "GET" }, tokenC);
    expect(await read.json()).toEqual([{ title: "Aktiv" }]);

    const file = await asUser(tokenC)
      .storage.from("project-covers")
      .createSignedUrl(`${project.id}/original.png`, 60);
    expect(file.data?.signedUrl).toBeTruthy();

    await pageC.goto(`/projektuebersicht/${project.id}`);
    await expect(pageC.getByText(/Abgelaufen am/)).toBeVisible();
    await expect(pageC.getByRole("button", { name: /Um 12 Monate verlängern/ })).toBeEnabled();
  });

  test("Bezahlschranke: Niemand verlängert sich selbst", async () => {
    const before = await admin.from("project_access").select("expires_at").eq("project_id", project.id).single();
    const future = new Date(Date.now() + 3650 * DAY_MS).toISOString();

    await expectNoChange(
      await rest(`project_access?project_id=eq.${project.id}`, { method: "PATCH", body: JSON.stringify({ expires_at: future }) }, tokenL),
    );
    await expectNoChange(await rest(`project_access?project_id=eq.${project.id}`, { method: "DELETE" }, tokenL));
    const upsert = await rest(
      "project_access",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ project_id: project.id, expires_at: future }),
      },
      tokenL,
    );
    expect(upsert.status).toBeGreaterThanOrEqual(400);

    const after = await admin.from("project_access").select("expires_at").eq("project_id", project.id).single();
    expect(new Date(after.data?.expires_at).getTime()).toBe(new Date(before.data?.expires_at).getTime());
  });

  test("G6: Nach der Verlängerung geht alles wieder", async () => {
    await setExpiry(project.id, 100);

    const chapter = await rest(
      `chapters?id=eq.${project.chapter}`,
      { method: "PATCH", body: JSON.stringify({ title: "Verlängert" }) },
      tokenC,
    );
    expect(await chapter.json()).toHaveLength(1);

    const file = fileIn("project-covers", project.id, project.chapter, "wieder.png");
    uploaded.push({ bucket: "project-covers", path: file });
    const { error } = await asUser(tokenC).storage.from("project-covers").upload(file, PNG, { contentType: "image/png" });
    expect(error).toBeNull();

    await pageC.goto(`/projektuebersicht/${project.id}`);
    await expect(pageC.getByRole("button", { name: `Kapitel „Verlängert" löschen` })).toBeVisible();
  });

  test("G14: Kunden legen keine Projekte an, auch nicht auf fremde Konten", async () => {
    for (const owner of [O, C]) {
      const id = crypto.randomUUID();
      const response = await rest(
        "projects",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ id, title: `Untergeschoben ${RUN_ID}`, owner_id: owner.id }),
        },
        tokenO,
      );
      expect(response.status).toBe(403);
      const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("id", id);
      expect(count).toBe(0);
    }

    const overview = await admin.rpc("account_deletion_overview", { p_user_id: C.id, p_email: C.email });
    expect(JSON.stringify(overview.data)).not.toContain("Untergeschoben");
  });

  test("G15: Die Leitung holt niemanden ohne Einladung ins Projekt", async () => {
    const response = await rest(
      "project_members",
      {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ project_id: project.id, user_id: O.id, role: "co_author" }),
      },
      tokenL,
    );
    expect(response.status).toBe(403);
    const { count } = await admin
      .from("project_members")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("user_id", O.id);
    expect(count).toBe(0);
  });

  test("G15: Eine echte Einladung funktioniert weiter", async () => {
    const token = crypto.randomBytes(24).toString("hex");
    const invitation = await admin.from("invitations").insert({
      project_id: project.id,
      email: O.email,
      role: "co_author",
      token,
      is_gift: false,
      expires_at: new Date(Date.now() + 5 * DAY_MS).toISOString(),
    });
    expect(invitation.error).toBeNull();

    await pageO.goto(`/einladung/${token}`);
    await pageO.getByRole("button", { name: "Annehmen" }).click();
    await pageO.waitForURL(new RegExp(`/projektuebersicht/${project.id}`), { timeout: 20_000 });

    const { data: member } = await admin
      .from("project_members")
      .select("role")
      .eq("project_id", project.id)
      .eq("user_id", O.id)
      .single();
    expect(member?.role).toBe("co_author");
    expect(await rest(`chapters?select=id&project_id=eq.${project.id}`, { method: "GET" }, tokenO).then((r) => r.json())).toHaveLength(1);
  });

  test("Verlassen und Löschen bleiben auch nach Ablauf möglich", async () => {
    await setExpiry(project.id, -1);

    const left = await rest(
      `project_members?project_id=eq.${project.id}&user_id=eq.${O.id}`,
      { method: "DELETE" },
      tokenO,
    );
    expect(left.status).toBeLessThan(300);
    expect(await left.json()).toHaveLength(1);

    const deleted = await rest(`projects?id=eq.${project.id}`, { method: "DELETE" }, tokenL);
    expect(deleted.status).toBeLessThan(300);
    const { count } = await admin
      .from("trash_projects")
      .select("project_id", { count: "exact", head: true })
      .eq("project_id", project.id);
    expect(count).toBe(1);
  });
});
