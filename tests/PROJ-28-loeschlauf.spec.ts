import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// PROJ-28 — automatischer Löschlauf gegen die echte Stage-Datenbank.
//
// Die Suite legt temporäre Konten und Projekte an und läuft deshalb nur mit
// `E2E_RETENTION=1`, nur gegen Stage und mit einem Worker:
//
//   E2E_RETENTION=1 npx playwright test tests/PROJ-28-loeschlauf.spec.ts --project=chromium --workers=1
//
// Sie ruft die Datenbankfunktion direkt auf, nie die Cron-Route, und löst
// deshalb keine Erinnerungsmails aus. Ist ein fremdes Projekt fällig, bricht
// sie ab, bevor etwas verschoben wird. Das QA-Konto wird nicht angefasst.

const ENABLED = process.env.E2E_RETENTION === "1";
const STAGE_HOST = "kdjhxqitfxnsavhiafdn.supabase.co";
const TEST_EMAIL_PREFIX = "e2e-loeschlauf-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const SESSION_PREFIX = `cs_e2e_loeschlauf_${RUN_ID}_`;
const DAY_MS = 86_400_000;
const RACE_ROUNDS = 25;

type Account = { id: string; email: string; password: string };
type RetentionRun = { due: number; moved: number; skipped: number; failed: number; braked: boolean };

let admin: SupabaseClient;
let anon: SupabaseClient;
let L: Account;
let C: Account;
let context: BrowserContext | undefined;
let page: Page;

const accounts: Account[] = [];
const projectIds = new Set<string>();

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

async function createProject(label: string, expiryOffsetDays: number): Promise<{ id: string; title: string }> {
  const id = crypto.randomUUID();
  const title = `${label} ${RUN_ID}`;
  projectIds.add(id);
  const project = await admin.from("projects").insert({ id, title, owner_id: L.id });
  if (project.error) throw new Error(project.error.message);
  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + expiryOffsetDays * DAY_MS).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);
  const payment = await admin.from("payments").insert({
    project_id: id,
    user_id: L.id,
    stripe_session_id: `${SESSION_PREFIX}first_${id}`,
    type: "initial_portal_access",
    amount_cents: 24900,
    currency: "eur",
    status: "completed",
  });
  if (payment.error) throw new Error(payment.error.message);
  const members = await admin.from("project_members").insert([
    { project_id: id, user_id: L.id, role: "projektleiter" },
    { project_id: id, user_id: C.id, role: "co_author" },
  ]);
  if (members.error) throw new Error(members.error.message);
  const chapter = await admin.from("chapters").insert({
    project_id: id,
    title: "Kapitel 1",
    sort_order: 0,
    page_count: 1,
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Erinnerung" }] }] },
  });
  if (chapter.error) throw new Error(chapter.error.message);
  return { id, title };
}

/** Verschiebt nie ein Projekt, das nicht von diesem Testlauf stammt. */
async function assertOnlyOwnProjectsDue(): Promise<void> {
  const { data, error } = await admin.rpc("retention_due");
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ project_id: string }>) {
    if (!projectIds.has(row.project_id)) {
      throw new Error("Ein fremdes Projekt wäre fällig, der Testlauf bricht ab.");
    }
  }
}

async function callMove(): Promise<RetentionRun> {
  const { data, error } = await admin.rpc("retention_move_due");
  if (error) throw new Error(error.message);
  return data as RetentionRun;
}

async function runRetention(): Promise<RetentionRun> {
  await assertOnlyOwnProjectsDue();
  return callMove();
}

async function trashEntry(projectId: string) {
  const { data, error } = await admin
    .from("trash_projects")
    .select("reason, purge_at, deleted_by")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { reason: string; purge_at: string; deleted_by: string | null } | null;
}

async function memberCount(projectId: string): Promise<number> {
  const { count, error } = await admin
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function expiresAt(projectId: string): Promise<number> {
  const { data, error } = await admin
    .from("project_access")
    .select("expires_at")
    .eq("project_id", projectId)
    .single();
  if (error) throw new Error(error.message);
  return new Date(data.expires_at as string).getTime();
}

/** Dieselben Datenbankschritte in derselben Reihenfolge wie der Stripe-Webhook. */
async function payRenewalLikeWebhook(projectId: string, sessionId: string): Promise<{ status: string }> {
  const payment = await admin.from("payments").insert({
    project_id: projectId,
    user_id: L.id,
    stripe_session_id: sessionId,
    type: "portal_access_renewal",
    amount_cents: 9900,
    currency: "eur",
    status: "completed",
  });
  if (payment.error) throw new Error(payment.error.message);

  const current = await expiresAt(projectId);
  const base = Math.max(current, Date.now());
  const write = await admin
    .from("project_access")
    .upsert(
      { project_id: projectId, expires_at: new Date(base + 365 * DAY_MS).toISOString() },
      { onConflict: "project_id" },
    );
  if (write.error) throw new Error(write.error.message);

  const restore = await admin.rpc("retention_restore_paid", { p_project_id: projectId });
  if (restore.error) throw new Error(restore.error.message);
  return restore.data as { status: string };
}

async function signIn(target: Page, account: Account): Promise<void> {
  await target.goto("/anmelden");
  await target.locator('input[name="email"]').fill(account.email);
  await target.locator('input[name="password"]').fill(account.password);
  await expect
    .poll(
      () =>
        target.evaluate(
          () =>
            (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
              ?.value.length ?? 0,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await target.getByRole("button", { name: "Anmelden", exact: true }).click();
  await target.waitForURL((url) => !url.pathname.includes("/anmelden"), { timeout: 45_000 });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("PROJ-28 — Löschlauf (nur Stage)", () => {
  test.skip(!ENABLED, "Legt echte Testdaten an, nur mit E2E_RETENTION=1");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const env = readEnvLocal();
    if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).host !== STAGE_HOST) {
      throw new Error("Diese Suite läuft nur gegen Stage.");
    }
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
    anon = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      options,
    );
    await assertOnlyOwnProjectsDue();

    L = await createAccount("leitung");
    C = await createAccount("co");
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    await signIn(page, L);
  });

  test.afterAll(async () => {
    await context?.close();
    if (!admin) return;
    const ids = [...projectIds];
    await admin.from("payments").delete().like("stripe_session_id", `${SESSION_PREFIX}%`);
    for (const id of ids) await admin.from("projects").delete().eq("id", id);
    if (ids.length > 0) await admin.from("storage_cleanup_queue").delete().in("project_id", ids);
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  test("AC-1 bis AC-3: Nur Projekte nach Tag 90 werden verschoben", async () => {
    const due = await createProject("Faellig", -91);
    const dayEightyNine = await createProject("Tag89", -89);
    const active = await createProject("Aktiv", 100);
    const renewed = await createProject("Verlaengert", -120);
    await payRenewalLikeWebhook(renewed.id, `${SESSION_PREFIX}renew_${renewed.id}`);

    const run = await runRetention();

    expect(run).toMatchObject({ moved: 1, failed: 0, braked: false });
    const entry = await trashEntry(due.id);
    expect(entry?.reason).toBe("expired");
    expect(entry?.deleted_by).toBeNull();
    const daysToPurge = (new Date(entry!.purge_at).getTime() - Date.now()) / DAY_MS;
    expect(daysToPurge).toBeGreaterThan(13.9);
    expect(daysToPurge).toBeLessThanOrEqual(14);
    for (const kept of [dayEightyNine, active, renewed]) {
      expect(await trashEntry(kept.id)).toBeNull();
      expect(await memberCount(kept.id)).toBe(2);
    }
  });

  test("AC-13, AC-15: Das Projekt verschwindet für Mitglieder, ohne Mail", async () => {
    const project = await createProject("Verschwindet", -95);
    await page.goto("/");
    await expect(page.locator("body")).toContainText(project.title);

    await runRetention();

    await page.goto("/");
    await expect(page.locator("body")).not.toContainText(project.title);
    await page.goto(`/projektuebersicht/${project.id}`);
    await expect(page.locator("body")).not.toContainText(project.title);
    expect(await memberCount(project.id)).toBe(0);

    const { count, error } = await admin
      .from("mail_log")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test("AC-18, AC-20: Support erkennt den Grund, nach der Rettung gelten 14 Tage", async () => {
    const project = await createProject("Rettung", -100);
    await runRetention();

    const found = await admin.rpc("trash_find", { p_search: project.title });
    expect(found.error).toBeNull();
    const row = (found.data as Array<{ item_id: string; delete_reason: string }>).find(
      (item) => item.item_id === project.id,
    );
    expect(row?.delete_reason).toBe("expired");

    const restored = await admin.rpc("trash_restore_project", { p_project_id: project.id });
    expect(restored.error).toBeNull();
    const holdUntil = new Date((restored.data as { holdUntil: string }).holdUntil).getTime();
    expect((holdUntil - Date.now()) / DAY_MS).toBeGreaterThan(13.9);
    expect(await memberCount(project.id)).toBe(2);

    await runRetention();
    expect(await trashEntry(project.id)).toBeNull();

    await page.goto(`/projektuebersicht/${project.id}`);
    await expect(page.getByText(/Abgelaufen am \d{2}\. \p{L}+ \d{4}/u)).toBeVisible();
    await expect(page.getByText(/Das Projekt wird am \d{2}\. \p{L}+ \d{4} gelöscht\./u)).toBeVisible();
    await expect(page.getByText("90 Tage nach dem Ablauf wird das Projekt gelöscht.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Um 12 Monate verlängern/ })).toBeEnabled();

    const hold = await admin
      .from("project_retention_holds")
      .update({ hold_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("project_id", project.id);
    expect(hold.error).toBeNull();
    await runRetention();
    expect((await trashEntry(project.id))?.reason).toBe("expired");
  });

  test("BUG-2: Eine Zahlung nach dem Verschieben holt das Projekt sofort zurück", async () => {
    const project = await createProject("Nachgezahlt", -100);
    await runRetention();
    expect((await trashEntry(project.id))?.reason).toBe("expired");

    const paid = await payRenewalLikeWebhook(project.id, `${SESSION_PREFIX}late_${project.id}`);

    expect(paid.status).toBe("restored");
    expect(await trashEntry(project.id)).toBeNull();
    expect(await memberCount(project.id)).toBe(2);
    await page.goto(`/projektuebersicht/${project.id}`);
    await expect(page.getByRole("button", { name: "Eigenes Kapitel" }).first()).toBeEnabled();
    await expect(page.getByText(/Abgelaufen am/)).toHaveCount(0);
  });

  test("AC-19: Nach dem endgültigen Löschen bleibt die Zahlung ohne Projektbezug", async () => {
    const project = await createProject("Endgueltig", -100);
    await runRetention();

    const removed = await admin.rpc("trash_delete_project_now", { p_project_id: project.id });
    expect(removed.error).toBeNull();

    const gone = await admin.from("projects").select("id").eq("id", project.id).maybeSingle();
    expect(gone.data).toBeNull();
    const payment = await admin
      .from("payments")
      .select("project_id, amount_cents")
      .eq("stripe_session_id", `${SESSION_PREFIX}first_${project.id}`)
      .single();
    expect(payment.error).toBeNull();
    expect(payment.data).toEqual({ project_id: null, amount_cents: 24900 });
  });

  test("AC-21: Eine gleichzeitige Zahlung geht nie verloren", async () => {
    let moved = 0;
    let kept = 0;

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const project = await createProject(`Rennen${round}`, -100);
      const sessionId = `${SESSION_PREFIX}race_${project.id}`;
      await assertOnlyOwnProjectsDue();

      // Die Zahlung braucht drei Schritte, der Lauf nur einen. Der Lauf startet
      // deshalb später, damit beide Reihenfolgen wirklich vorkommen.
      const [, paid] = await Promise.all([
        wait(Math.random() * 200).then(callMove),
        payRenewalLikeWebhook(project.id, sessionId),
      ]);

      const payments = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("stripe_session_id", sessionId);
      expect(payments.count, `Zahlung in Runde ${round}`).toBe(1);
      expect(await expiresAt(project.id), `Ablauf in Runde ${round}`).toBeGreaterThan(Date.now());

      // Egal wer zuerst kam: Ein bezahltes Projekt liegt danach nie im Papierkorb.
      expect(await trashEntry(project.id), `Papierkorb in Runde ${round}`).toBeNull();
      expect(await memberCount(project.id), `Mitglieder in Runde ${round}`).toBe(2);
      expect(["restored", "not_in_trash"], `Status in Runde ${round}`).toContain(paid.status);
      if (paid.status === "restored") moved += 1;
      else kept += 1;
    }

    console.log(`AC-21: ${kept} Mal gewann die Zahlung, ${moved} Mal kam das Projekt aus dem Papierkorb zurück`);
    expect(moved + kept).toBe(RACE_ROUNDS);
    expect(kept, "Die Zahlung muss mehrfach zuerst gekommen sein").toBeGreaterThanOrEqual(3);
    expect(moved, "Der Lauf muss mehrfach zuerst gekommen sein").toBeGreaterThanOrEqual(3);
  });

  test("AC-23: Drei gleichzeitige Läufe verschieben jedes Projekt genau einmal", async () => {
    const projects = [];
    for (let index = 0; index < 8; index += 1) projects.push(await createProject(`Parallel${index}`, -100));
    await assertOnlyOwnProjectsDue();

    const runs = await Promise.all([callMove(), callMove(), callMove()]);

    expect(runs.reduce((sum, run) => sum + run.moved, 0)).toBe(projects.length);
    expect(runs.every((run) => run.failed === 0 && !run.braked)).toBe(true);
    for (const project of projects) {
      expect((await trashEntry(project.id))?.reason).toBe("expired");
      expect(await memberCount(project.id)).toBe(0);
    }
    expect((await runRetention()).moved).toBe(0);
  });

  test("AC-24: Ohne Server-Rechte geht nichts", async () => {
    const target = await createProject("Geschuetzt", -100);

    for (const call of [
      anon.rpc("retention_move_due"),
      anon.rpc("retention_due"),
      anon.rpc("retention_restore_paid", { p_project_id: target.id }),
      anon.rpc("trash_restore_project", { p_project_id: target.id }),
      anon.rpc("trash_find"),
      anon.from("project_retention_holds").select("project_id"),
      anon.from("project_retention_holds").insert({
        project_id: target.id,
        reason: "support_restore",
        hold_until: new Date(Date.now() + 3650 * DAY_MS).toISOString(),
      }),
    ]) {
      const { error } = await call;
      expect(error).not.toBeNull();
    }
    expect(await trashEntry(target.id)).toBeNull();
    const holds = await admin.from("project_retention_holds").select("project_id").eq("project_id", target.id);
    expect(holds.data).toEqual([]);

    await runRetention();
    expect((await trashEntry(target.id))?.reason).toBe("expired");
  });
});
