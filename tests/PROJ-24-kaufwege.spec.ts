import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import Stripe from "stripe";
import { accessToken, createTestAccount, readEnvLocal, signIn, STAGE_HOST } from "./helpers/stage";

// PROJ-24 — Kontaktdaten auf allen Kaufwegen, gegen Stage und den lokalen Webhook.
//
// Die Suite legt temporäre Konten und Käufe an und läuft deshalb nur mit
// `E2E_PURCHASE=1` und nur gegen Stage:
//
//   E2E_PURCHASE=1 npx playwright test tests/PROJ-24-kaufwege.spec.ts --project=chromium --workers=1
//
// Zahlungen werden als signierte Webhook-Events simuliert. Es fließt kein Geld.
// Lokal gibt es keinen Mail-Schlüssel, deshalb geht auch keine Mail hinaus.

const ENABLED = process.env.E2E_PURCHASE === "1";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_dummy";
const TEST_EMAIL_PREFIX = "e2e-kaufwege-";
const RUN_ID = crypto.randomBytes(4).toString("hex");
const CONTACT_EMAIL = `erzaehl-${RUN_ID}@example.test`;
const CONTACT_PHONE = "+491711234567";

type Account = { id: string; email: string; password: string };

let admin: SupabaseClient;
let supabaseUrl = "";
let anonKey = "";
let buyer: Account;
const accounts: Account[] = [];
const sessions: string[] = [];
const drafts: string[] = [];

async function createAccount(label: string): Promise<Account> {
  const account = await createTestAccount(admin, {
    email: `${TEST_EMAIL_PREFIX}${label}-${RUN_ID}@example.test`,
    name: `Test ${label}`,
  });
  accounts.push(account);
  return account;
}

async function createDraft(values: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  drafts.push(id);
  const { error } = await admin.from("purchase_narration_drafts").insert({
    id,
    narrator_name: "Oma Erna",
    channel: "both",
    email: CONTACT_EMAIL,
    phone: CONTACT_PHONE,
    ...values,
  });
  if (error) throw new Error(error.message);
  return id;
}

function checkoutSession(input: {
  id?: string;
  paymentStatus?: string;
  email?: string;
  metadata: Record<string, string>;
}) {
  const id = input.id ?? `cs_test_e2e_${RUN_ID}_${crypto.randomBytes(5).toString("hex")}`;
  if (!sessions.includes(id)) sessions.push(id);
  return {
    id,
    object: "checkout.session",
    status: "complete",
    payment_status: input.paymentStatus ?? "paid",
    amount_total: 24900,
    currency: "eur",
    customer_email: null,
    customer_details: { email: input.email ?? buyer.email },
    invoice: null,
    metadata: { product_type: "initial", full_name: "Karla Käufer", ...input.metadata },
  };
}

async function sendEvent(type: string, session: ReturnType<typeof checkoutSession>) {
  const payload = JSON.stringify({
    id: `evt_e2e_${crypto.randomBytes(6).toString("hex")}`,
    object: "event",
    type,
    data: { object: session },
  });
  const signature = new Stripe("sk_test_e2e_dummy").webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  const response = await fetch("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function projectOf(sessionId: string): Promise<string | null> {
  const { data } = await admin
    .from("payments")
    .select("project_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  return (data?.project_id as string | undefined) ?? null;
}

async function settingsOf(projectId: string) {
  const { data, error } = await admin
    .from("narration_settings")
    .select("*")
    .eq("project_id", projectId);
  expect(error).toBeNull();
  return data ?? [];
}

async function invitationsOf(projectId: string) {
  const { data, error } = await admin
    .from("invitations")
    .select("email, role")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function draftOf(id: string) {
  const { data } = await admin
    .from("purchase_narration_drafts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

test.describe("PROJ-24 — Kontaktdaten auf allen Kaufwegen (nur Stage)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ENABLED, "Nur mit E2E_PURCHASE=1, legt temporäre Stage-Daten an.");
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    const env = readEnvLocal();
    if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGE_HOST)) {
      throw new Error("PROJ-24-Suite läuft nur gegen Stage.");
    }
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    buyer = await createAccount("kaeufer");
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: payments } = await admin
      .from("payments")
      .select("project_id")
      .in("stripe_session_id", sessions);
    const { data: claims } = await admin
      .from("purchase_claims")
      .select("project_id")
      .in("stripe_session_id", sessions);
    const projects = [...(payments ?? []), ...(claims ?? [])]
      .map((row) => row.project_id as string | null)
      .filter((id): id is string => !!id);
    await admin.from("payments").delete().in("stripe_session_id", sessions);
    await admin.from("purchase_claims").delete().in("stripe_session_id", sessions);
    for (const id of new Set(projects)) {
      await admin.from("mail_log").delete().eq("project_id", id);
      await admin.from("storage_chapter_cleanup_queue").delete().eq("project_id", id);
      await admin.from("storage_cleanup_queue").delete().eq("project_id", id);
      await admin.from("projects").delete().eq("id", id);
    }
    if (drafts.length > 0) await admin.from("purchase_narration_drafts").delete().in("id", drafts);
    for (const account of accounts) {
      if (!account.email.startsWith(TEST_EMAIL_PREFIX) || !account.email.includes(RUN_ID)) continue;
      await admin.from("mail_log").delete().eq("user_id", account.id);
      await admin.auth.admin.deleteUser(account.id);
    }
  });

  test("AC-17: Angemeldeter Kauf legt die Einstellungen an und löscht die Vorbereitung", async () => {
    const draft = await createDraft();
    const session = checkoutSession({
      metadata: { user_id: buyer.id, is_gift: "0", narration_draft: draft },
    });
    await sendEvent("checkout.session.completed", session);
    const project = await projectOf(session.id);
    expect(project).not.toBeNull();
    const [settings] = await settingsOf(project!);
    expect(settings).toMatchObject({
      narrator_name: "Oma Erna",
      channel: "both",
      email: CONTACT_EMAIL,
      phone: CONTACT_PHONE,
      weekday: 0,
      rhythm_weeks: 1,
    });
    expect(await draftOf(draft)).toBeNull();
  });

  test("Wiederholter Webhook legt nichts doppelt an", async () => {
    const draft = await createDraft();
    const session = checkoutSession({
      metadata: { user_id: buyer.id, is_gift: "0", narration_draft: draft },
    });
    await sendEvent("checkout.session.completed", session);
    const second = await sendEvent("checkout.session.completed", session);
    expect(second.duplicate).toBe(true);
    const project = await projectOf(session.id);
    expect(await settingsOf(project!)).toHaveLength(1);
  });

  test("SEPA: Die Daten warten bis zum Zahlungseingang", async () => {
    const draft = await createDraft({ channel: "sms", email: null });
    const metadata = { user_id: buyer.id, is_gift: "0", narration_draft: draft };
    const pending = checkoutSession({ paymentStatus: "unpaid", metadata });
    await sendEvent("checkout.session.completed", pending);
    expect(await projectOf(pending.id)).toBeNull();
    expect(await draftOf(draft)).toMatchObject({ status: "payment_pending" });

    await sendEvent("checkout.session.async_payment_succeeded", {
      ...pending,
      payment_status: "paid",
    });
    const project = await projectOf(pending.id);
    expect(await settingsOf(project!)).toHaveLength(1);
    expect(await draftOf(draft)).toBeNull();
  });

  test("Geschenk ohne eigenen Zugang und ohne Konto", async () => {
    const draft = await createDraft({
      channel: "email",
      phone: null,
      gift_recipient_email: CONTACT_EMAIL,
    });
    const session = checkoutSession({
      email: `schenker-${RUN_ID}@example.test`,
      metadata: {
        gift_direct: "1",
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        gift_recipient_name: "Oma Erna",
        gift_recipient_role: "projektleiter",
        buyer_retains_access: "0",
        narration_draft: draft,
      },
    });
    await sendEvent("checkout.session.completed", session);
    const project = await projectOf(session.id);
    expect(await settingsOf(project!)).toMatchObject([{ channel: "email", email: CONTACT_EMAIL }]);
    expect(await invitationsOf(project!)).toMatchObject([
      { email: CONTACT_EMAIL, role: "projektleiter" },
    ]);
    expect(await draftOf(draft)).toBeNull();
  });

  test("Geschenk ohne Erzähl-Impulse: Nur die Einladungsadresse wartet", async () => {
    const draft = await createDraft({
      narrator_name: null,
      channel: null,
      email: null,
      phone: null,
      gift_recipient_email: CONTACT_EMAIL,
    });
    const session = checkoutSession({
      email: `schenker2-${RUN_ID}@example.test`,
      metadata: {
        gift_direct: "1",
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        gift_recipient_name: "Oma Erna",
        gift_recipient_role: "projektleiter",
        buyer_retains_access: "0",
        narration_draft: draft,
      },
    });
    await sendEvent("checkout.session.completed", session);
    const project = await projectOf(session.id);
    expect(await settingsOf(project!)).toHaveLength(0);
    expect(await invitationsOf(project!)).toMatchObject([{ email: CONTACT_EMAIL }]);
    expect(await draftOf(draft)).toBeNull();
  });

  test("Kauf ohne Konto: Daten warten bis zum Einlösen und nutzen die Zahl-Adresse", async ({
    browser,
  }) => {
    const guest = await createAccount("gast");
    const draft = await createDraft({
      narrator_name: "Gerda Gast",
      channel: "email",
      email: null,
      phone: null,
      uses_checkout_email: true,
    });
    const session = checkoutSession({
      email: guest.email,
      metadata: {
        guest: "1",
        claim_hash: crypto.createHash("sha256").update(RUN_ID).digest("hex"),
        is_gift: "0",
        narration_draft: draft,
      },
    });
    await sendEvent("checkout.session.completed", session);
    expect(await draftOf(draft)).toMatchObject({ status: "paid" });
    const { data: claim } = await admin
      .from("purchase_claims")
      .select("metadata, project_id")
      .eq("stripe_session_id", session.id)
      .single();
    expect(JSON.stringify(claim?.metadata)).not.toContain("@");
    expect(claim?.project_id).toBeNull();

    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, guest);
    await expect
      .poll(
        async () =>
          (
            await admin
              .from("purchase_claims")
              .select("project_id")
              .eq("stripe_session_id", session.id)
              .single()
          ).data?.project_id ?? null,
        { timeout: 20_000 },
      )
      .not.toBeNull();
    await context.close();

    const { data: claimed } = await admin
      .from("purchase_claims")
      .select("project_id")
      .eq("stripe_session_id", session.id)
      .single();
    expect(await settingsOf(claimed!.project_id as string)).toMatchObject([
      { narrator_name: "Gerda Gast", channel: "email", email: guest.email },
    ]);
    expect(await draftOf(draft)).toBeNull();
  });

  test("Ein Kauf klappt auch, wenn die Vorbereitung fehlt oder die Kennung kaputt ist", async () => {
    for (const reference of [crypto.randomUUID(), "keine-gueltige-kennung"]) {
      const session = checkoutSession({
        metadata: { user_id: buyer.id, is_gift: "0", narration_draft: reference },
      });
      await sendEvent("checkout.session.completed", session);
      const project = await projectOf(session.id);
      expect(project).not.toBeNull();
      expect(await settingsOf(project!)).toHaveLength(0);
    }
  });

  test("RLS: Browser und angemeldete Nutzer kommen nicht an die Tabellen", async ({ browser }) => {
    const draft = await createDraft();
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, buyer);
    const token = accessToken(await context.cookies());
    await context.close();

    for (const bearer of [token, anonKey]) {
      for (const table of ["narration_settings", "purchase_narration_drafts"]) {
        const url = `${supabaseUrl}/rest/v1/${table}`;
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        };
        const read = await fetch(`${url}?select=*`, { headers });
        expect(read.status, `${table} lesen`).toBeGreaterThanOrEqual(400);
        const write = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ narrator_name: "Angriff", channel: "email", email: "a@b.de" }),
        });
        expect(write.status, `${table} schreiben`).toBeGreaterThanOrEqual(400);
        const remove = await fetch(`${url}?narrator_name=neq.x`, { method: "DELETE", headers });
        expect(remove.status, `${table} löschen`).toBeGreaterThanOrEqual(400);
      }
    }
    expect(await draftOf(draft)).not.toBeNull();
  });

  test("Scheitert Stripe beim Kaufstart, bleibt keine Vorbereitung zurück", async ({ page }) => {
    const name = `Oma ${RUN_ID}`;
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /Als Geschenk/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Vor- und Nachnamen").fill("Karla Käufer");
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Name der beschenkten Person").fill(name);
    await page.getByRole("button", { name: /Nur per Sprachnachricht erzählen/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.locator("#narrationEmail").fill(CONTACT_EMAIL);
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByRole("button", { name: /Jetzt kaufen/ }).click();
    await expect(page.getByText(/Der Kauf konnte gerade nicht gestartet werden/)).toBeVisible({
      timeout: 20_000,
    });
    const { data } = await admin
      .from("purchase_narration_drafts")
      .select("id")
      .eq("narrator_name", name);
    expect(data).toEqual([]);
  });
});
