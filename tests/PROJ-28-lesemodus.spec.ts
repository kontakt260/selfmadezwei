import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { waitForEditorReady, waitForSaved } from "./helpers/editor-audit";

// PROJ-28 — Lesemodus abgelaufener Projekte im echten Browser gegen Stage.
//
// Die Suite legt temporäre Konten und Projekte an und läuft deshalb nur mit
// `E2E_READ_ONLY=1` und nur gegen Stage:
//
//   E2E_READ_ONLY=1 npx playwright test tests/PROJ-28-lesemodus.spec.ts --project=chromium
//
// Das QA-Konto wird nicht angefasst, es werden keine Mails ausgelöst.

const ENABLED = process.env.E2E_READ_ONLY === "1";
const STAGE_HOST = "kdjhxqitfxnsavhiafdn.supabase.co";
const TEST_EMAIL_PREFIX = "e2e-lesemodus-";
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR;
const RUN_ID = crypto.randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const EXPIRED_LABEL = /Abgelaufen am \d{2}\. \p{L}+ \d{4}/u;
const DELETE_HINT = "90 Tage nach dem Ablauf wird das Projekt gelöscht.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAFAAH/e+m+7wAAAABJRU5ErkJggg==",
  "base64",
);

type Account = { id: string; email: string; password: string };
type Role = "projektleiter" | "co_author";
type TestProject = { id: string; title: string; chapters: string[] };

let admin: SupabaseClient;
let L: Account;
let C: Account;
let contextL: BrowserContext | undefined;
let contextC: BrowserContext | undefined;
let pageL: Page;
let pageC: Page;
let expired: TestProject;
let active: TestProject;

const accounts: Account[] = [];
const projectIds = new Set<string>();
const uploaded: string[] = [];

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
  const fullTitle = `${title} ${RUN_ID}`;
  projectIds.add(id);
  const project = await admin.from("projects").insert({ id, title: fullTitle, owner_id: members[0][0].id });
  if (project.error) throw new Error(project.error.message);
  const access = await admin.from("project_access").insert({
    project_id: id,
    expires_at: new Date(Date.now() + 100 * DAY_MS).toISOString(),
  });
  if (access.error) throw new Error(access.error.message);
  const payment = await admin.from("payments").insert({
    project_id: id,
    user_id: members[0][0].id,
    stripe_session_id: `cs_e2e_lesemodus_${RUN_ID}_${id}`,
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

  const chapters: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const chapterId = crypto.randomUUID();
    const storagePath = `${id}/${chapterId}/bild.png`;
    const upload = await admin.storage
      .from("chapter-heroes")
      .upload(storagePath, PNG, { contentType: "image/png" });
    if (upload.error) throw new Error(upload.error.message);
    uploaded.push(storagePath);
    const chapter = await admin.from("chapters").insert({
      id: chapterId,
      project_id: id,
      title: `Kapitel ${index + 1}`,
      sort_order: index,
      page_count: 1,
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: `Erinnerung Nummer ${index + 1}` }] },
        ],
      },
      image_sections: {
        start: {
          layout: "1-spaltig",
          images: [{ id: "bild", storage_path: storagePath, signed_url: "", alt: "Testbild" }],
        },
        end: { layout: "1-spaltig", images: [] },
      },
    });
    if (chapter.error) throw new Error(chapter.error.message);
    chapters.push(chapterId);
  }
  return { id, title: fullTitle, chapters };
}

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

/** Zählt Server-Actions, also jeden Schreibversuch der Oberfläche. */
function watchActions(page: Page) {
  let count = 0;
  const listener = (request: { method(): string; headers(): Record<string, string> }) => {
    if (request.method() === "POST" && request.headers()["next-action"]) count += 1;
  };
  page.on("request", listener);
  return {
    count: () => count,
    stop: () => page.off("request", listener),
  };
}

const chapterSnapshot = async (id: string) => {
  const { data, error } = await admin
    .from("chapters")
    .select("title, body, sort_order, updated_at, page_count")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
};

async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage });
}

test.describe("PROJ-28 — Lesemodus (nur Stage)", () => {
  test.skip(!ENABLED, "Legt echte Testdaten an, nur mit E2E_READ_ONLY=1");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    const env = readEnvLocal();
    if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).host !== STAGE_HOST) {
      throw new Error("Diese Suite läuft nur gegen Stage.");
    }
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    L = await createAccount("leitung");
    C = await createAccount("co");
    expired = await createProject("Abgelaufen", [[L, "projektleiter"], [C, "co_author"]]);
    active = await createProject("Aktiv", [[L, "projektleiter"]]);
    await setExpiry(expired.id, -3);

    contextL = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contextC = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    pageL = await contextL.newPage();
    pageC = await contextC.newPage();
    await signIn(pageL, L);
    await signIn(pageC, C);
  });

  test.afterAll(async () => {
    await contextL?.close();
    await contextC?.close();
    if (!admin) return;
    for (const id of projectIds) {
      await admin.from("payments").delete().eq("project_id", id);
      await admin.from("projects").delete().eq("id", id);
    }
    if (uploaded.length > 0) await admin.storage.from("chapter-heroes").remove(uploaded);
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  test("AC-4: Abgelaufenes Projekt bleibt auf der Startseite und ohne Umleitung", async () => {
    await pageC.goto("/");
    await expect(pageC).not.toHaveURL(/zugang-abgelaufen/);
    await expect(pageC.locator("body")).toContainText(expired.title);

    await pageC.goto(`/projektuebersicht/${expired.id}`);
    await expect(pageC).toHaveURL(new RegExp(`/projektuebersicht/${expired.id}`));

    await pageC.goto("/zugang-abgelaufen");
    await expect(pageC).not.toHaveURL(/zugang-abgelaufen/);
  });

  test("AC-10 bis AC-12: Zugangsfeld zeigt Ablauf, Hinweis und Verlängern", async () => {
    await pageL.goto(`/projektuebersicht/${expired.id}`);
    await expect(pageL.getByText(EXPIRED_LABEL)).toBeVisible();
    await expect(pageL.getByText(DELETE_HINT)).toBeVisible();
    const renew = pageL.getByRole("button", { name: /Um 12 Monate verlängern/ });
    await expect(renew).toBeEnabled();
    await expect(renew).toHaveCSS("background-color", "rgb(208, 188, 166)");
    await expect(renew).toHaveCSS("opacity", "1");
    await expect(pageL.locator("body")).not.toContainText(/-\d+ Tagen/);
    await expect(pageL.locator("body")).not.toContainText(/papierkorb/i);
    await shot(pageL, "uebersicht-desktop");
  });

  test("AC-6, AC-7: Verändernde Buttons sind grau, Verlassen und Entfernen aktiv", async () => {
    for (const name of ["Eigenes Kapitel", "Erzähl-Impuls"]) {
      await expect(pageL.getByRole("button", { name }).first()).toBeDisabled();
    }
    for (const label of ["umbenennen", "löschen"]) {
      await expect(pageL.getByRole("button", { name: `Kapitel „Kapitel 1" ${label}` })).toBeDisabled();
    }
    await expect(pageL.getByRole("button", { name: "Nutzer hinzufügen" })).toBeDisabled();
    await expect(pageL.getByRole("link", { name: "Ansehen" }).first()).toBeVisible();
    await expect(pageL.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
    await expect(pageL.getByRole("button", { name: /Mitglied „.*" entfernen/ }).nth(1)).toBeEnabled();
    await expect(pageL.getByRole("button", { name: "Projekt verlassen" })).toBeEnabled();

    await pageC.goto(`/projektuebersicht/${expired.id}`);
    await expect(pageC.getByRole("button", { name: "Projekt verlassen" })).toBeEnabled();

    await pageL.goto("/");
    await expect(pageL.getByRole("button", { name: `Projekt „${expired.title}" löschen` })).toBeEnabled();
  });

  test("AC-6: Kapitel lassen sich nicht umsortieren", async () => {
    await pageL.goto(`/projektuebersicht/${expired.id}`);
    const list = pageL.getByRole("list", { name: "Kapitelreihenfolge" });
    await pageL.getByLabel("Kapitel 1: Kapitel 1", { exact: true }).dragTo(list.getByRole("listitem").nth(1));
    await expect(pageL.getByRole("button", { name: "Reihenfolge speichern" })).toHaveCount(0);
  });

  test("AC-5, AC-8: Kapitel-Editor zeigt alles und speichert nichts", async () => {
    const before = await chapterSnapshot(expired.chapters[0]);
    const actions = watchActions(pageL);

    await pageL.goto(`/projektuebersicht/${expired.id}/kapiteleditor/${expired.chapters[0]}`);
    await waitForEditorReady(pageL);

    const editor = pageL.locator(".ProseMirror").first();
    await expect(editor).toContainText("Erinnerung Nummer 1");
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await expect(pageL.locator(".image-slot img").first()).toBeVisible();
    await expect(pageL.getByText("Nur zum Ansehen")).toBeVisible();
    await expect(pageL.getByRole("button", { name: "Fett" })).toBeDisabled();
    const toolbar = await pageL
      .locator(".editor-chrome")
      .first()
      .locator("button, [role=combobox]")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          disabled: element.matches(":disabled"),
          opacity: Number(getComputedStyle(element).opacity),
          color: getComputedStyle(element).color,
          pressed: element.getAttribute("data-state") === "on",
        })),
      );
    expect(toolbar.length).toBeGreaterThan(10);
    for (const control of toolbar) {
      expect(control.disabled, control.label).toBe(true);
      expect(control.opacity, control.label).toBeLessThanOrEqual(0.5);
    }
    expect(new Set(toolbar.filter((control) => !control.pressed).map((control) => control.color)).size).toBe(1);
    await expect(pageL.getByRole("button", { name: "Bild löschen" })).toHaveCount(0);
    await expect(pageL.getByRole("button", { name: "Bild hinzufügen" }).first()).toBeDisabled();

    const title = pageL.getByLabel("Kapitel-Titel");
    await expect(title).toHaveJSProperty("readOnly", true);
    await title.click({ force: true });
    await pageL.keyboard.type("Hack");
    await editor.click();
    await pageL.keyboard.type("Hack");
    await pageL.keyboard.press("Control+b");

    await pageL.waitForTimeout(4_000);
    await expect(editor).not.toContainText("Hack");
    await expect(title).toHaveValue("Kapitel 1");
    await expect(pageL.getByText("Fehler beim Speichern")).toHaveCount(0);
    expect(actions.count()).toBe(0);
    actions.stop();
    expect(await chapterSnapshot(expired.chapters[0])).toEqual(before);
    await shot(pageL, "editor-desktop", false);
  });

  test("AC-5, AC-8: Cover-Editor zeigt alles und speichert nichts", async () => {
    const actions = watchActions(pageL);
    await pageL.goto(`/projektuebersicht/${expired.id}/cover-bearbeiten`);

    await expect(pageL.getByRole("heading", { name: "Cover ansehen" })).toBeVisible();
    await expect(pageL.getByLabel("Buchtitel")).toBeDisabled();
    await expect(pageL.getByLabel("Buchtitel")).toHaveValue(expired.title);
    await expect(pageL.getByLabel("Untertitel")).toBeDisabled();
    await expect(pageL.getByRole("button", { name: "Foto hochladen" })).toBeDisabled();
    await expect(pageL.getByRole("button", { name: /^Muster / }).first()).toBeDisabled();
    await expect(pageL.getByRole("button", { name: /^Farbe / }).first()).toBeDisabled();
    await expect(pageL.getByText("Nur zum Ansehen")).toBeVisible();

    await pageL.waitForTimeout(3_000);
    expect(actions.count()).toBe(0);
    actions.stop();
    await shot(pageL, "cover-desktop");
  });

  test("Layout: Tablet und Handy ohne seitliches Scrollen", async () => {
    for (const [name, width, height] of [
      ["tablet", 768, 1024],
      ["handy", 375, 812],
    ] as const) {
      await pageC.setViewportSize({ width, height });
      await pageC.goto(`/projektuebersicht/${expired.id}`);
      await expect(pageC.getByText(EXPIRED_LABEL)).toBeVisible();
      const overflow = await pageC.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, name).toBeLessThanOrEqual(0);
      await shot(pageC, `uebersicht-${name}`);
    }
    await pageC.setViewportSize({ width: 1440, height: 1000 });
  });

  test("Edge: Ein anderes aktives Projekt bleibt normal bearbeitbar", async () => {
    await pageL.goto(`/projektuebersicht/${active.id}`);
    await expect(pageL.getByText(EXPIRED_LABEL)).toHaveCount(0);
    await expect(pageL.getByRole("button", { name: "Eigenes Kapitel" }).first()).toBeEnabled();
    await expect(pageL.getByRole("link", { name: "Bearbeiten" }).first()).toBeVisible();

    await pageL.goto(`/projektuebersicht/${active.id}/kapiteleditor/${active.chapters[0]}`);
    await waitForEditorReady(pageL);
    await expect(pageL.locator(".ProseMirror").first()).toHaveAttribute("contenteditable", "true");
    await expect(pageL.getByRole("button", { name: "Fett" })).toBeEnabled();
  });

  test("Edge: Läuft der Zugang beim Schreiben ab, scheitert das Speichern sichtbar", async () => {
    await pageL.goto(`/projektuebersicht/${active.id}/kapiteleditor/${active.chapters[1]}`);
    await waitForEditorReady(pageL);
    const editor = pageL.locator(".ProseMirror").first();
    await editor.click();
    await pageL.keyboard.type(" vorher");
    await waitForSaved(pageL);

    await setExpiry(active.id, -1);
    try {
      await pageL.keyboard.type(" nachher");
      await expect(pageL.getByText("Fehler beim Speichern")).toBeVisible({ timeout: 15_000 });
      await expect(editor).toContainText("nachher");
      const saved = await chapterSnapshot(active.chapters[1]);
      expect(JSON.stringify(saved.body)).toContain("vorher");
      expect(JSON.stringify(saved.body)).not.toContain("nachher");

      await pageL.goto(`/projektuebersicht/${active.id}/kapiteleditor/${active.chapters[1]}`, {
        waitUntil: "commit",
      }).catch(() => undefined);
      await waitForEditorReady(pageL);
      await expect(pageL.getByText("Nur zum Ansehen")).toBeVisible();
    } finally {
      await setExpiry(active.id, 100);
    }
  });

  test("AC-9: Nach der Verlängerung geht alles sofort wieder", async () => {
    await setExpiry(expired.id, 100);

    await pageC.goto(`/projektuebersicht/${expired.id}`);
    await expect(pageC.getByText(EXPIRED_LABEL)).toHaveCount(0);
    await expect(pageC.getByRole("button", { name: "Eigenes Kapitel" }).first()).toBeEnabled();

    await pageC.goto(`/projektuebersicht/${expired.id}/kapiteleditor/${expired.chapters[0]}`);
    await waitForEditorReady(pageC);
    const editor = pageC.locator(".ProseMirror").first();
    await expect(editor).toContainText("Erinnerung Nummer 1");
    await editor.click();
    await pageC.keyboard.type(" wieder offen");
    await waitForSaved(pageC);
    await expect
      .poll(async () => JSON.stringify((await chapterSnapshot(expired.chapters[0])).body), {
        timeout: 10_000,
      })
      .toContain("wieder offen");
  });

  test("AC-7: Konto-Bereich und Verlassen funktionieren im Lesemodus", async () => {
    await setExpiry(expired.id, -1);

    await pageC.goto("/persoenlicher-bereich");
    await expect(pageC.locator("#account-email")).toHaveValue(C.email);

    await pageC.goto(`/projektuebersicht/${expired.id}`);
    await pageC.getByRole("button", { name: "Projekt verlassen" }).click();
    await pageC.getByRole("dialog").getByRole("button", { name: /verlassen/i }).click();
    await pageC.waitForURL((url) => !url.pathname.includes(expired.id), { timeout: 20_000 });

    const { count } = await admin
      .from("project_members")
      .select("id", { count: "exact", head: true })
      .eq("project_id", expired.id)
      .eq("user_id", C.id);
    expect(count).toBe(0);
  });
});
