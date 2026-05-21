import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, PRODUCTS, type ProductType } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import crypto from "node:crypto";

// Stripe-Webhook-Route (PROJ-6 Backend).
//
// Edge-Runtime ist hier ungeeignet: Stripe-Signaturen verlangen
// byte-genauen Raw-Body. Wir erzwingen Node-Runtime und lesen den Body
// als String (NICHT als JSON).
export const runtime = "nodejs";

// Force-dynamic: kein Caching, Webhook-Calls sollen jederzeit
// ausgeführt werden.
export const dynamic = "force-dynamic";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

// 3-Linien-Verteidigung (siehe Tech-Design Sektion C):
//   1. Signatur-Verifikation (Stripe-Secret).
//   2. Idempotenz-Check (payments.stripe_session_id UNIQUE).
//   3. Service-Role-Write.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig) return new NextResponse("Missing signature header", { status: 400 });
  if (!secret) return new NextResponse("Webhook secret not configured", { status: 500 });

  // Raw-Body lesen (NICHT req.json — Stripe signiert das Original).
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Invalid signature: ${msg}`, { status: 400 });
  }

  // Nur checkout.session.completed verarbeiten — andere Events 200 quittieren,
  // damit Stripe nicht retried.
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    // Nur „paid"-Sessions führen zu State-Änderungen.
    return NextResponse.json({ received: true, ignored: session.payment_status });
  }

  const supabase = createServiceRoleClient();

  // Idempotenz-Check: existiert bereits ein payments-Eintrag mit dieser
  // stripe_session_id? Wenn ja, 200 OK ohne weitere Aktion.
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const meta = session.metadata ?? {};
  const productType = meta.product_type as ProductType | undefined;
  const userId = meta.user_id as string | undefined;
  if (!productType || !userId) {
    // Metadata fehlt — kein State-Update möglich. Wir loggen aber
    // antworten 200, sonst retried Stripe ewig.
    return NextResponse.json(
      { received: true, error: "missing_metadata", productType, userId },
      { status: 200 },
    );
  }

  try {
    if (productType === "initial") {
      await handleInitial(supabase, session, meta, userId);
    } else if (productType === "renewal") {
      await handleRenewal(supabase, session, meta, userId);
    } else if (productType === "vapi") {
      await handleVapi(supabase, session, meta, userId);
    } else {
      return NextResponse.json(
        { received: true, error: "unknown_product_type", productType },
        { status: 200 },
      );
    }
  } catch (err) {
    // Bei DB-Fehler: 500 zurückgeben, Stripe retried. Idempotenz-Check
    // oben verhindert Duplikate beim Retry.
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Internal error: ${msg}`, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: productType });
}

// ─── Initial-Kauf (249 €) ─────────────────────────────────────────────

async function handleInitial(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
  userId: string,
) {
  const isGift = meta.is_gift === "1";
  const giftMode = meta.gift_mode as "phone-only" | "phone-plus-computer" | undefined;
  const recipientEmail = meta.gift_recipient_email?.trim() || null;
  const recipientRole =
    (meta.gift_recipient_role as "projektleiter" | "co_author" | undefined) ?? "co_author";
  const buyerRetainsAccess = meta.buyer_retains_access === "1";

  // 1. Projekt anlegen.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      title: "Lebensgeschichten",
      owner_id: userId,
    })
    .select("id")
    .single();
  if (projErr || !project) throw new Error(projErr?.message ?? "project insert failed");
  const projectId = project.id;

  // 2. project_access setzen (12 Monate ab jetzt).
  const expiresAt = new Date(Date.now() + TWELVE_MONTHS_MS).toISOString();
  const { error: accessErr } = await supabase
    .from("project_access")
    .insert({ project_id: projectId, expires_at: expiresAt });
  if (accessErr) throw new Error(accessErr.message);

  // 3. project_members befüllen je nach Geschenk-Variante:
  //    - „Für mich selbst": Käufer = projektleiter.
  //    - „Geschenk — Nur Telefon": Käufer = projektleiter (Empfänger nutzt
  //      nur Vapi; kein Portal-Login).
  //    - „Geschenk — Auch Computer", Käufer behält Zugang: Käufer = projektleiter
  //      + invitation für Empfänger (co_author).
  //    - „Geschenk — Auch Computer", Käufer verzichtet auf Zugang: KEIN
  //      project_members-Eintrag für Käufer; invitation für Empfänger
  //      (projektleiter).
  let buyerIsMember = true;
  let buyerRole: "projektleiter" | "co_author" = "projektleiter";
  let inviteRecipient = false;
  let inviteRole: "projektleiter" | "co_author" = "co_author";

  if (!isGift) {
    buyerIsMember = true;
    buyerRole = "projektleiter";
  } else if (giftMode === "phone-only") {
    buyerIsMember = true;
    buyerRole = "projektleiter";
  } else if (giftMode === "phone-plus-computer") {
    if (buyerRetainsAccess) {
      buyerIsMember = true;
      buyerRole = "projektleiter";
      inviteRecipient = true;
      inviteRole = recipientRole;
    } else {
      buyerIsMember = false;
      inviteRecipient = true;
      inviteRole = "projektleiter";
    }
  }

  if (buyerIsMember) {
    const { error: memErr } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role: buyerRole });
    if (memErr) throw new Error(memErr.message);
  }

  if (inviteRecipient && recipientEmail) {
    const inviteExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const token = generateInviteToken();
    const { error: invErr } = await supabase
      .from("invitations")
      .insert({
        project_id: projectId,
        email: recipientEmail.toLowerCase(),
        role: inviteRole,
        token,
        expires_at: inviteExpiresAt,
      });
    if (invErr) throw new Error(invErr.message);
  }

  // 4. payments-Eintrag (idempotenz-tragend via UNIQUE stripe_session_id).
  const { error: payErr } = await supabase.from("payments").insert({
    project_id: projectId,
    user_id: userId,
    stripe_session_id: session.id,
    type: PRODUCTS.initial.paymentType,
    amount_cents: session.amount_total ?? PRODUCTS.initial.amountCents,
    currency: (session.currency ?? PRODUCTS.initial.currency).toLowerCase(),
    status: "completed",
  });
  if (payErr) throw new Error(payErr.message);
}

// ─── Portal-Verlängerung (99 €) ───────────────────────────────────────

async function handleRenewal(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
  userId: string,
) {
  const projectId = meta.project_id?.trim();
  if (!projectId) throw new Error("renewal: missing project_id in metadata");

  // Project exists check (sollte immer der Fall sein — sonst gab's einen
  // race vor Webhook-Eintreffen). Kein Hard-Fail nötig, der INSERT
  // unten würde fehlschlagen.

  // Aktuellen expires_at lesen (default = now() falls neu).
  const { data: access } = await supabase
    .from("project_access")
    .select("expires_at")
    .eq("project_id", projectId)
    .maybeSingle();

  const baseTime =
    access?.expires_at && new Date(access.expires_at).getTime() > Date.now()
      ? new Date(access.expires_at).getTime()
      : Date.now();
  const newExpiresAt = new Date(baseTime + TWELVE_MONTHS_MS).toISOString();

  // UPSERT in project_access (Webhook ist service_role → RLS bypass).
  const { error: accessErr } = await supabase
    .from("project_access")
    .upsert(
      { project_id: projectId, expires_at: newExpiresAt },
      { onConflict: "project_id" },
    );
  if (accessErr) throw new Error(accessErr.message);

  const { error: payErr } = await supabase.from("payments").insert({
    project_id: projectId,
    user_id: userId,
    stripe_session_id: session.id,
    type: PRODUCTS.renewal.paymentType,
    amount_cents: session.amount_total ?? PRODUCTS.renewal.amountCents,
    currency: (session.currency ?? PRODUCTS.renewal.currency).toLowerCase(),
    status: "completed",
  });
  if (payErr) throw new Error(payErr.message);
}

// ─── Vapi-Top-Up (19 €) ───────────────────────────────────────────────

async function handleVapi(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
  userId: string,
) {
  const projectId = meta.project_id?.trim();
  if (!projectId) throw new Error("vapi: missing project_id in metadata");

  // Kein State-Update außer payments — die verfügbare Sprechzeit wird
  // bei Bedarf aus payments + voice_sessions berechnet (siehe
  // Tech-Design Sektion G).
  const { error: payErr } = await supabase.from("payments").insert({
    project_id: projectId,
    user_id: userId,
    stripe_session_id: session.id,
    type: PRODUCTS.vapi.paymentType,
    amount_cents: session.amount_total ?? PRODUCTS.vapi.amountCents,
    currency: (session.currency ?? PRODUCTS.vapi.currency).toLowerCase(),
    status: "completed",
  });
  if (payErr) throw new Error(payErr.message);
}

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
