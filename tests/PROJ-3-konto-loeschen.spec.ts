import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { waitForPage } from "./helpers/page-ready";
import { accessToken, createTestAccount, readEnvLocal, restRequest, signIn, STAGE_HOST } from "./helpers/stage";

// PROJ-3 — echte Kontolöschung gegen die Stage-Datenbank.
//
// ACHTUNG: Diese Suite legt zwei temporäre Konten an und löscht sie wirklich.
// Sie läuft deshalb nur mit `E2E_ACCOUNT_DELETION=1` und nur gegen Stage:
//
//   E2E_ACCOUNT_DELETION=1 npx playwright test tests/PROJ-3-konto-loeschen.spec.ts --project=chromium
//
// Das QA-Konto wird nie angefasst. Alle Testdaten werden über ihre IDs
// entfernt, auch wenn ein Test scheitert.

const ENABLED = process.env.E2E_ACCOUNT_DELETION === "1";
const TEST_EMAIL_PREFIX = "e2e-konto-";
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR;

const RUN_ID = crypto.randomBytes(4).toString("hex");
const TAG = `E2E-Konto-${RUN_ID}`;

type Account = { id: string; email: string; password: string; name: string };
type Role = "projektleiter" | "co_author";

const BUCKETS = ["project-logos", "chapter-heroes", "project-covers", "exports"] as const;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAFAAH/e+m+7wAAAABJRU5ErkJggg==",
  "base64",
);

let admin: SupabaseClient;
let supabaseUrl = "";
let anonKey = "";
let A: Account;
let B: Account;
let contextA: BrowserContext | undefined;
let contextB: BrowserContext | undefined;
let pageA: Page;
let pageB: Page;

let soloProject = "";
let sharedProject = "";
let leaveTestProject = "";
let sharedChapter = "";
let paymentId = "";
let normalInvitation = "";
let giftInvitation = "";
const claimIds: string[] = [];
const paymentIds: string[] = [];
const projectIds = new Set<string>();
const uploaded: Array<{ bucket: string; path: string }> = [];

async function createAccount(label: string, name: string): Promise<Account> {
  return createTestAccount(admin, {
    email: `${TEST_EMAIL_PREFIX}${label}-${RUN_ID}@example.test`,
    name: name,
  });
}

let memberClock = 0;

async function createProject(input: {
  title: string;
  owner: Account | null;
  members: Array<[Account, Role]>;
  chapters?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  projectIds.add(id);
  const project = await admin
    .from("projects")
    .insert({ id, title: input.title, owner_id: input.owner?.id ?? null });
  if (project.error) throw new Error(project.error.message);

  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);

  for (const [member, role] of input.members) {
    memberClock += 1;
    const created = new Date(Date.now() + memberClock * 1000).toISOString();
    const row = await admin
      .from("project_members")
      .insert({ project_id: id, user_id: member.id, role, created_at: created });
    if (row.error) throw new Error(row.error.message);
  }

  for (let index = 0; index < (input.chapters ?? 1); index += 1) {
    const chapter = await admin.from("chapters").insert({
      project_id: id,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      body: { type: "doc", content: [{ type: "paragraph" }] },
    });
    if (chapter.error) throw new Error(chapter.error.message);
  }
  return id;
}

async function removeProject(id: string): Promise<void> {
  await admin.from("projects").delete().eq("id", id);
  projectIds.delete(id);
}

const chapterCount = async (projectId: string): Promise<number> => {
  const { count } = await admin
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return count ?? 0;
};

const memberRole = async (projectId: string, account: Account): Promise<string | null> => {
  const { data } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", account.id)
    .maybeSingle();
  return data?.role ?? null;
};

const ownerOf = async (projectId: string): Promise<string | null | undefined> => {
  const { data } = await admin.from("projects").select("owner_id").eq("id", projectId).maybeSingle();
  return data ? data.owner_id : undefined;
};

const accountExists = async (account: Account): Promise<boolean> => {
  const { data } = await admin.auth.admin.getUserById(account.id);
  return Boolean(data?.user);
};

const prepare = (account: Account, confirmed: string[], successors: Record<string, string>) =>
  admin.rpc("prepare_account_deletion", {
    p_user_id: account.id,
    p_email: account.email,
    p_confirmed_delete: confirmed,
    p_successors: successors,
  });

const leave = (projectId: string, account: Account, successor: Account | null = null) =>
  admin.rpc("leave_project", {
    p_project_id: projectId,
    p_user_id: account.id,
    p_successor_user_id: successor?.id ?? null,
  });

function rest(pathname: string, init: RequestInit, token?: string): Promise<Response> {
  return restRequest({ supabaseUrl, anonKey, prefer: "return=minimal" }, pathname, init, token);
}

async function openDeleteDialog(page: Page, account: Account) {
  await page.goto("/persoenlicher-bereich");
  await expect(page.locator("#account-email")).toHaveText(account.email);
  await page.getByRole("button", { name: "Konto löschen", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Wird gelöscht")).toBeVisible({ timeout: 20_000 });
  return dialog;
}

/** Letzte Sperre vor jedem echten Klick: nur die eigenen Testkonten. */
async function assertDisposable(page: Page, account: Account): Promise<void> {
  expect(account.email.startsWith(TEST_EMAIL_PREFIX)).toBe(true);
  expect(account.email).toContain(RUN_ID);
  await expect(page.locator("#account-email")).toHaveText(account.email);
}

const setHidden = (page: Page, name: string, value: string) =>
  page.evaluate(
    ([field, content]) => {
      const input = document.querySelector(`input[type="hidden"][name="${field}"]`) as HTMLInputElement;
      input.value = content;
    },
    [name, value],
  );

async function insertClaim(redeemed: boolean): Promise<void> {
  const id = crypto.randomUUID();
  claimIds.push(id);
  const { error } = await admin.from("purchase_claims").insert({
    id,
    stripe_session_id: `cs_e2e_${RUN_ID}_${redeemed ? "claimed" : "open"}`,
    buyer_email: A.email,
    claim_token_hash: crypto.randomBytes(32).toString("hex"),
    metadata: { full_name: A.name },
    amount_cents: 24900,
    claimed_by: redeemed ? A.id : null,
    claimed_at: redeemed ? new Date().toISOString() : null,
  });
  expect(error).toBeNull();
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

test.describe("PROJ-3 — echte Kontolöschung (nur Stage)", () => {
  test.skip(!ENABLED, "Löscht echte Testkonten, nur mit E2E_ACCOUNT_DELETION=1");
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    const env = readEnvLocal();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (new URL(supabaseUrl).host !== STAGE_HOST) {
      throw new Error("Diese Suite läuft nur gegen Stage.");
    }
    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    A = await createAccount("a", "Anna Testkonto");
    B = await createAccount("b", "Bob Testkonto");
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
    if (!admin) return;

    for (const { bucket, path: file } of uploaded) {
      await admin.storage.from(bucket).remove([file]);
    }
    if (claimIds.length > 0) await admin.from("purchase_claims").delete().in("id", claimIds);
    if (paymentIds.length > 0) await admin.from("payments").delete().in("id", paymentIds);
    await admin.from("payments").delete().like("stripe_session_id", `cs_e2e_${RUN_ID}%`);

    // Auch Projekte, die die App selbst für die Testkonten angelegt hat.
    for (const account of [A, B]) {
      if (!account) continue;
      const [{ data: owned }, { data: memberships }] = await Promise.all([
        admin.from("projects").select("id").eq("owner_id", account.id),
        admin.from("project_members").select("project_id").eq("user_id", account.id),
      ]);
      (owned ?? []).forEach((project) => projectIds.add(project.id));
      (memberships ?? []).forEach((member) => projectIds.add(member.project_id));
    }

    const ids = [...projectIds];
    if (ids.length > 0) {
      await admin.from("projects").delete().in("id", ids);
      await admin.from("storage_cleanup_queue").delete().in("project_id", ids);
    }

    for (const account of [A, B]) {
      if (!account) continue;
      if (await accountExists(account)) await admin.auth.admin.deleteUser(account.id);
      await admin.from("invitations").delete().eq("email", account.email);
      await admin.from("mail_retry_queue").delete().eq("payload->>to", account.email);
    }
  });

  // ─── Gleichzeitigkeit, ohne ein Konto zu löschen ─────────────────────────

  test("Gleichzeitig: Nachfolge verlässt das Projekt, während gelöscht wird", async () => {
    for (let round = 0; round < 5; round += 1) {
      const project = await createProject({
        title: `${TAG} Race ${round}`,
        owner: A,
        members: [[A, "projektleiter"], [B, "co_author"]],
        chapters: 2,
      });

      const [prepared, left] = await Promise.all([
        prepare(A, [], { [project]: B.id }),
        leave(project, B),
      ]);

      expect(left.error).toBeNull();
      if (prepared.error) expect(prepared.error.message).toBe("overview_changed");
      expect(await chapterCount(project)).toBe(2);
      expect(await memberRole(project, A)).toBe("projektleiter");
      expect(await memberRole(project, B)).toBeNull();
      expect(await ownerOf(project)).toBe(A.id);
      await removeProject(project);
    }
  });

  test("Gleichzeitig: Doppelter Löschversuch setzt die Nachfolge genau einmal", async () => {
    const project = await createProject({
      title: `${TAG} Doppelt`,
      owner: A,
      members: [[A, "projektleiter"], [B, "co_author"]],
    });

    const results = await Promise.all([
      prepare(A, [], { [project]: B.id }),
      prepare(A, [], { [project]: B.id }),
    ]);

    expect(results.map((result) => result.error)).toEqual([null, null]);
    const handovers = results.flatMap(
      (result) => (result.data as { handovers: unknown[] }).handovers,
    );
    expect(handovers).toHaveLength(1);
    expect(await memberRole(project, B)).toBe("projektleiter");
    await removeProject(project);
  });

  test("Gleichzeitig: Zwei Projektleitungen verlassen, eine bleibt immer", async () => {
    for (let round = 0; round < 5; round += 1) {
      const project = await createProject({
        title: `${TAG} Zwei ${round}`,
        owner: A,
        members: [[A, "projektleiter"], [B, "projektleiter"]],
      });

      const results = await Promise.all([leave(project, A), leave(project, B)]);
      const errors = results.map((result) => result.error?.message ?? null);

      expect(errors.filter((error) => error === null)).toHaveLength(1);
      expect(errors.filter((error) => error === "last_member")).toHaveLength(1);
      const { data } = await admin.from("project_members").select("role").eq("project_id", project);
      expect(data).toEqual([{ role: "projektleiter" }]);
      await removeProject(project);
    }
  });

  test("Sperre: Echtes deleteUser scheitert bei der letzten Projektleitung", async () => {
    const project = await createProject({
      title: `${TAG} Sperre`,
      owner: A,
      members: [[A, "projektleiter"], [B, "co_author"]],
      chapters: 2,
    });

    const { error } = await admin.auth.admin.deleteUser(A.id);

    expect(error).not.toBeNull();
    expect(await accountExists(A)).toBe(true);
    expect(await memberRole(project, A)).toBe("projektleiter");
    expect(await chapterCount(project)).toBe(2);
    await removeProject(project);
  });

  // ─── Testdaten für die echten Abläufe ────────────────────────────────────

  test("Testdaten und Anmeldung", async ({ browser }) => {
    soloProject = await createProject({
      title: `${TAG} Solo <img src=x onerror="window.__xss=1">`,
      owner: A,
      members: [[A, "projektleiter"]],
      chapters: 3,
    });
    sharedProject = await createProject({
      title: `${TAG} Gemeinsam`,
      owner: A,
      members: [[A, "projektleiter"], [B, "co_author"]],
      chapters: 2,
    });
    leaveTestProject = await createProject({
      title: `${TAG} Verlassen`,
      owner: A,
      members: [[A, "projektleiter"], [B, "co_author"]],
      chapters: 1,
    });

    const { data: chapter } = await admin
      .from("chapters")
      .select("id")
      .eq("project_id", sharedProject)
      .limit(1)
      .single();
    sharedChapter = chapter!.id;

    const files: Array<[string, string, Buffer, string]> = [
      ["project-logos", `${soloProject}/logo.png`, PNG, "image/png"],
      ["chapter-heroes", `${soloProject}/kapitel/bild.png`, PNG, "image/png"],
      ["project-covers", `${soloProject}/cover.png`, PNG, "image/png"],
      ["exports", `${soloProject}/buch.pdf`, Buffer.from("%PDF-1.4\n%%EOF\n"), "application/pdf"],
    ];
    for (const [bucket, file, content, contentType] of files) {
      const { error } = await admin.storage.from(bucket).upload(file, content, { contentType });
      expect(error).toBeNull();
      uploaded.push({ bucket, path: file });
    }

    paymentId = crypto.randomUUID();
    paymentIds.push(paymentId);
    const payment = await admin.from("payments").insert({
      id: paymentId,
      project_id: soloProject,
      user_id: A.id,
      stripe_session_id: `cs_e2e_${RUN_ID}_payment`,
      type: "initial_portal_access",
      amount_cents: 24900,
      status: "completed",
    });
    expect(payment.error).toBeNull();

    // Der offene Kauf kommt erst direkt vor der Löschung dazu, sonst löst ihn
    // die Anmeldung automatisch ein und legt ein weiteres Projekt an.
    await insertClaim(true);

    normalInvitation = crypto.randomUUID();
    giftInvitation = crypto.randomUUID();
    const invitations = await admin.from("invitations").insert([
      {
        id: normalInvitation,
        project_id: sharedProject,
        email: A.email,
        role: "co_author",
        is_gift: false,
        token: crypto.randomBytes(32).toString("base64url"),
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      },
      {
        id: giftInvitation,
        project_id: leaveTestProject,
        email: A.email,
        role: "co_author",
        is_gift: true,
        token: crypto.randomBytes(32).toString("base64url"),
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      },
    ]);
    expect(invitations.error).toBeNull();

    contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
    await signIn(pageA, A);
    await signIn(pageB, B);
  });

  // ─── Rechte gegen die echte Datenbank ────────────────────────────────────

  test("Rechte: Angemeldete und Anonyme erreichen die Löschfunktionen nicht", async () => {
    const token = accessToken(await contextB!.cookies());
    const calls: Array<[string, Record<string, unknown>]> = [
      ["prepare_account_deletion", { p_user_id: A.id, p_email: A.email, p_confirmed_delete: [soloProject], p_successors: {} }],
      ["account_deletion_overview", { p_user_id: A.id, p_email: A.email }],
      ["account_deletion_plan", { p_user_id: A.id, p_email: A.email }],
      ["leave_project", { p_project_id: sharedProject, p_user_id: A.id, p_successor_user_id: B.id }],
      ["project_handover_details", { p_project_id: sharedProject, p_title: "x", p_user_id: A.id }],
    ];

    for (const [name, body] of calls) {
      for (const bearer of [token, undefined]) {
        const response = await rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }, bearer);
        expect(response.ok, `${name} darf nicht erreichbar sein`).toBe(false);
      }
    }
    for (const table of ["chapter_contributors", "storage_cleanup_queue"]) {
      for (const bearer of [token, undefined]) {
        const response = await rest(`${table}?select=*`, { method: "GET" }, bearer);
        expect(response.ok, `${table} darf nicht lesbar sein`).toBe(false);
      }
    }

    expect(await ownerOf(soloProject)).toBe(A.id);
    expect(await memberRole(sharedProject, A)).toBe("projektleiter");
  });

  test("BUG-7: Co-Autoren können den Eigentümer nicht ändern", async () => {
    const token = accessToken(await contextB!.cookies());

    const ownerChange = await rest(
      `projects?id=eq.${sharedProject}`,
      { method: "PATCH", body: JSON.stringify({ owner_id: B.id }) },
      token,
    );
    expect(ownerChange.ok).toBe(false);
    expect(await ownerOf(sharedProject)).toBe(A.id);

    const titleChange = await rest(
      `projects?id=eq.${sharedProject}`,
      { method: "PATCH", body: JSON.stringify({ title: `${TAG} Gemeinsam` }) },
      token,
    );
    expect(titleChange.ok).toBe(true);
  });

  test("Mitschreibende: Schreiben über die echte Session wird erfasst", async () => {
    const token = accessToken(await contextB!.cookies());
    const before = await admin
      .from("chapter_contributors")
      .select("user_id")
      .eq("chapter_id", sharedChapter);
    expect(before.data).toEqual([]);

    const response = await rest(
      `chapters?id=eq.${sharedChapter}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          body: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Von Bob" }] }],
          },
        }),
      },
      token,
    );
    expect(response.ok).toBe(true);

    const after = await admin
      .from("chapter_contributors")
      .select("user_id")
      .eq("chapter_id", sharedChapter);
    expect(after.data).toEqual([{ user_id: B.id }]);
  });

  // ─── Dialog ──────────────────────────────────────────────────────────────

  test("Dialog zeigt, was gelöscht wird und was bleibt", async () => {
    const dialog = await openDeleteDialog(pageA, A);

    await expect(dialog.getByText(`${TAG} Solo`)).toBeVisible();
    await expect(dialog.getByText(`${TAG} Gemeinsam`).first()).toBeVisible();
    await expect(dialog.getByText("Bleibt bestehen")).toBeVisible();
    await expect(dialog.getByRole("listitem").first()).toHaveText(
      `Ihr Konto: ${A.name} (${A.email})`,
    );
    await expect(dialog.getByText(/Möchten Sie eigene Texte entfernen lassen/)).toBeVisible();
    await expect(dialog.getByText(/Gemeinsame Projekte bleiben/)).toHaveCount(0);
    await expect(dialog.getByRole("combobox")).toHaveCount(2);
    await expect(dialog.getByRole("combobox").first()).toContainText("Bob Testkonto");
    await expect(dialog.getByText(/Exportieren|Kopie/)).toHaveCount(0);

    const submit = dialog.getByRole("button", { name: "Konto endgültig löschen" });
    await expect(submit).toBeDisabled();
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");
    await expect(submit).toBeEnabled();

    // Der Projekttitel wird als Text angezeigt, nicht als HTML ausgeführt.
    expect(await pageA.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    await pageA.locator("#delete-confirm").fill("");
    await shot(pageA, "dialog-desktop-1440");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    expect(await accountExists(A)).toBe(true);
  });

  test("Co-Autoren sehen keine Nachfolge-Auswahl", async () => {
    const dialog = await openDeleteDialog(pageB, B);
    await expect(dialog.getByText(`${TAG} Gemeinsam`)).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });

  for (const [label, width, height] of [
    ["smartphone-375", 375, 812],
    ["tablet-768", 768, 1024],
  ] as const) {
    test(`Dialog passt auf ${label}`, async () => {
      await pageA.setViewportSize({ width, height });
      const dialog = await openDeleteDialog(pageA, A);

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      expect(await pageA.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      const submit = dialog.getByRole("button", { name: "Konto endgültig löschen" });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await shot(pageA, `dialog-${label}`);

      await dialog.getByRole("button", { name: "Abbrechen" }).click();
      await pageA.setViewportSize({ width: 1440, height: 900 });
    });
  }

  // Regression zu BUG-2 und BUG-5 aus der QA vom 2026-11-22.
  for (const [label, width, height] of [
    ["smartphone-375", 375, 812],
    ["tablet-768", 768, 1024],
  ] as const) {
    test(`Kopfzeile verdeckt die Warnung nicht, Text gut lesbar auf ${label}`, async () => {
      await pageA.setViewportSize({ width, height });
      const dialog = await openDeleteDialog(pageA, A);
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      const heading = dialog.getByRole("heading", { name: "Konto wirklich löschen?" });
      // Nicht über elementFromPoint: Der offene Dialog setzt `pointer-events:
      // none` auf den Body, die Kopfzeile würde dabei übersprungen.
      const covered = await heading.evaluate((element) => {
        const header = document.querySelector("header");
        const dialogElement = element.closest('[role="alertdialog"]');
        if (!header || !dialogElement) return false;
        const headerZ = Number(getComputedStyle(header).zIndex) || 0;
        const dialogZ = Number(getComputedStyle(dialogElement).zIndex) || 0;
        const headerRect = header.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return headerZ > dialogZ && rect.top < headerRect.bottom && rect.bottom > headerRect.top;
      });
      const contrast = await dialog.locator("p").first().evaluate((element) => {
        const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((channel) => {
            const c = channel / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const foreground = luminance(channels(getComputedStyle(element).color));
        const background = luminance(
          channels(getComputedStyle(element.closest('[role="alertdialog"]')!).backgroundColor),
        );
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      const textAlign = await dialog
        .getByRole("listitem")
        .first()
        .evaluate((element) => getComputedStyle(element).textAlign);
      await shot(pageA, `dialog-oben-${label}`);
      await dialog.getByRole("button", { name: "Abbrechen" }).click();
      await pageA.setViewportSize({ width: 1440, height: 900 });
      expect(covered).toBe(false);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect(textAlign).toBe("left");
    });
  }

  test("Alte Fehlermeldung verschwindet beim erneuten Öffnen", async () => {
    const dialog = await openDeleteDialog(pageA, A);
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");
    await setHidden(pageA, "confirmation", "egal");
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(dialog.getByText("Bitte bestätigen Sie die Löschung erneut.")).toBeVisible();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();

    await pageA.getByRole("button", { name: "Konto löschen", exact: true }).click();
    const reopened = pageA.getByRole("alertdialog");
    await expect(reopened.getByText("Wird gelöscht")).toBeVisible({ timeout: 20_000 });
    const stale = await reopened.getByText("Bitte bestätigen Sie die Löschung erneut.").count();
    await reopened.getByRole("button", { name: "Abbrechen" }).click();
    expect(stale).toBe(0);
  });

  // ─── Manipulierte Formulare ──────────────────────────────────────────────

  test("Manipuliert: Ohne Bestätigung passiert nichts", async () => {
    const dialog = await openDeleteDialog(pageA, A);
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");
    await setHidden(pageA, "confirmation", "egal");
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();

    await expect(dialog.getByText("Bitte bestätigen Sie die Löschung erneut.")).toBeVisible();
    expect(await accountExists(A)).toBe(true);
    expect(await ownerOf(soloProject)).toBe(A.id);
  });

  test("Manipuliert: Nicht bestätigtes Projekt wird nicht gelöscht", async () => {
    const dialog = await openDeleteDialog(pageA, A);
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");
    await setHidden(pageA, "confirmedDelete", "[]");
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();

    await expect(dialog.getByText(/hat sich etwas geändert/)).toBeVisible();
    expect(await accountExists(A)).toBe(true);
    expect(await chapterCount(soloProject)).toBe(3);
  });

  test("Manipuliert: Fremde Person als Nachfolge wird abgelehnt", async () => {
    const dialog = await openDeleteDialog(pageA, A);
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");
    await setHidden(
      pageA,
      "successors",
      JSON.stringify({ [sharedProject]: crypto.randomUUID(), [leaveTestProject]: B.id }),
    );
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();

    await expect(dialog.getByText(/hat sich etwas geändert/)).toBeVisible();
    expect(await accountExists(A)).toBe(true);
    expect(await memberRole(sharedProject, B)).toBe("co_author");
    expect(await chapterCount(soloProject)).toBe(3);
  });

  // ─── Projekt verlassen ───────────────────────────────────────────────────

  test("Verlassen: Einzige Leitung übergibt an die Nachfolge", async () => {
    await pageA.goto(`/projektuebersicht/${leaveTestProject}`);
    await waitForPage(pageA);
    await pageA.getByRole("button", { name: "Projekt verlassen" }).click();
    const dialog = pageA.getByRole("dialog");
    await expect(dialog.getByText(/Wer soll das Projekt weiterführen/)).toBeVisible();
    await expect(dialog.getByRole("combobox")).toContainText("Bob Testkonto");
    await dialog.getByRole("button", { name: "Projekt verlassen" }).click();
    await pageA.waitForURL(/\/persoenlicher-bereich/);

    expect(await memberRole(leaveTestProject, A)).toBeNull();
    expect(await memberRole(leaveTestProject, B)).toBe("projektleiter");
    expect(await ownerOf(leaveTestProject)).toBe(B.id);
    expect(await chapterCount(leaveTestProject)).toBe(1);
  });

  test("Abgelaufener Zugang: Der Weg zum Konto-Löschen bleibt offen", async () => {
    const ids = [sharedProject, leaveTestProject];
    const expired = await admin
      .from("project_access")
      .update({ expires_at: new Date(Date.now() - 86_400_000).toISOString() })
      .in("project_id", ids);
    expect(expired.error).toBeNull();

    try {
      await pageB.goto("/");
      await expect(pageB).not.toHaveURL(/\/zugang-abgelaufen/);
      await pageB.goto("/persoenlicher-bereich");
      await expect(pageB).toHaveURL(/\/persoenlicher-bereich/);
      await expect(pageB.locator("#account-email")).toHaveText(B.email);
      await pageB.getByRole("button", { name: "Konto löschen", exact: true }).click();
      await expect(pageB.getByRole("alertdialog").getByText("Wird gelöscht")).toBeVisible({
        timeout: 20_000,
      });
      await pageB.getByRole("alertdialog").getByRole("button", { name: "Abbrechen" }).click();
    } finally {
      await admin
        .from("project_access")
        .update({ expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
        .in("project_id", ids);
    }
  });

  // ─── Echte Löschungen ────────────────────────────────────────────────────

  test("Echte Löschung: Konto weg, gemeinsames Buch bleibt bei der Nachfolge", async () => {
    const dialog = await openDeleteDialog(pageA, A);
    await expect(dialog.getByRole("combobox")).toHaveCount(1);
    await insertClaim(false);
    await pageA.locator("#delete-confirm").fill("LÖSCHEN");

    // Zusätzlich manipuliert: Das gemeinsame Projekt darf trotzdem nicht sterben.
    await setHidden(pageA, "confirmedDelete", JSON.stringify([soloProject, sharedProject]));

    await assertDisposable(pageA, A);
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await pageA.waitForURL(/\/anmelden/, { timeout: 30_000 });

    expect(await accountExists(A)).toBe(false);
    const profile = await admin.from("profiles").select("id").eq("id", A.id).maybeSingle();
    expect(profile.data).toBeNull();

    // Gemeinsames Buch bleibt vollständig.
    expect(await ownerOf(sharedProject)).toBe(B.id);
    expect(await memberRole(sharedProject, B)).toBe("projektleiter");
    expect(await chapterCount(sharedProject)).toBe(2);
    const contributors = await admin
      .from("chapter_contributors")
      .select("user_id")
      .eq("chapter_id", sharedChapter);
    expect(contributors.data).toEqual([{ user_id: B.id }]);

    // Einzelprojekt ist weg.
    expect(await ownerOf(soloProject)).toBeUndefined();
    expect(await chapterCount(soloProject)).toBe(0);
    projectIds.delete(soloProject);

    // Dateien verschwinden aus allen vier Speichern.
    await expect
      .poll(
        async () => {
          let remaining = 0;
          for (const bucket of BUCKETS) {
            const { data } = await admin.storage.from(bucket).list(soloProject);
            remaining += data?.length ?? 0;
          }
          return remaining;
        },
        { timeout: 30_000 },
      )
      .toBe(0);
    await expect
      .poll(
        async () => {
          const { count } = await admin
            .from("storage_cleanup_queue")
            .select("project_id", { count: "exact", head: true })
            .eq("project_id", soloProject);
          return count;
        },
        { timeout: 15_000 },
      )
      .toBe(0);

    // Zahlungen bleiben ohne Personenbezug.
    const payment = await admin
      .from("payments")
      .select("user_id, project_id, amount_cents")
      .eq("id", paymentId)
      .single();
    expect(payment.data).toEqual({ user_id: null, project_id: null, amount_cents: 24900 });

    // Eingelöster Kauf bereinigt, offener Kauf bleibt.
    const redeemed = await admin
      .from("purchase_claims")
      .select("buyer_email, metadata, claimed_by")
      .eq("id", claimIds[0])
      .single();
    expect(redeemed.data).toEqual({ buyer_email: null, metadata: {}, claimed_by: null });
    const open = await admin.from("purchase_claims").select("buyer_email").eq("id", claimIds[1]).single();
    expect(open.data?.buyer_email).toBe(A.email);

    // Normale Einladung weg, offenes Geschenk bleibt.
    const normal = await admin.from("invitations").select("id").eq("id", normalInvitation).maybeSingle();
    expect(normal.data).toBeNull();
    const gift = await admin.from("invitations").select("id").eq("id", giftInvitation).maybeSingle();
    expect(gift.data?.id).toBe(giftInvitation);
  });

  test("Nach der Löschung: Keine Anmeldung und kein Zugriff mehr", async () => {
    await pageA.goto("/persoenlicher-bereich");
    await expect(pageA).toHaveURL(/\/anmelden/);

    await pageA.locator('input[name="email"]').fill(A.email);
    await pageA.locator('input[name="password"]').fill(A.password);
    await expect
      .poll(
        () =>
          pageA.evaluate(
            () =>
              (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
                ?.value.length ?? 0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await pageA.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(pageA.getByText(/kein Konto|falsch/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(pageA).toHaveURL(/\/anmelden/);
  });

  test("Echte Löschung: Einzelprojekt weg, Projekt mit offenem Geschenk bleibt", async () => {
    const dialog = await openDeleteDialog(pageB, B);
    await expect(dialog.getByText(`${TAG} Gemeinsam`)).toBeVisible();
    await expect(dialog.getByText(`${TAG} Verlassen`)).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await pageB.locator("#delete-confirm").fill("LÖSCHEN");

    await assertDisposable(pageB, B);
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await pageB.waitForURL(/\/anmelden/, { timeout: 30_000 });

    expect(await accountExists(B)).toBe(false);

    // Nur noch B war im Projekt, kein offenes Geschenk: wird gelöscht.
    expect(await ownerOf(sharedProject)).toBeUndefined();
    expect(await chapterCount(sharedProject)).toBe(0);

    // Offenes, bezahltes Geschenk: Das Projekt wartet auf die beschenkte Person.
    expect(await ownerOf(leaveTestProject)).toBeNull();
    expect(await chapterCount(leaveTestProject)).toBe(1);
    const gift = await admin.from("invitations").select("role").eq("id", giftInvitation).single();
    expect(gift.data?.role).toBe("projektleiter");
  });
});
