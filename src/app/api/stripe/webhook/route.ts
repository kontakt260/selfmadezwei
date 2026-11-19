import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, PRODUCTS, type ProductType } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendPortalPurchaseMail } from "@/lib/email/send-portal-purchase";
import { sendRenewalInfoMail, sendRenewalMail } from "@/lib/email/send-renewal";
import { sendInvitationMail } from "@/lib/email/send-invitation";
import { sendGuestPurchaseMail } from "@/lib/email/send-guest-purchase";
import { formatEur, formatGermanDate } from "@/lib/email/format";
import { fulfillInitialPurchase, PROJECT_DEFAULT_TITLE } from "@/lib/purchases/fulfill-initial";
import { isGuestSession, recordGuestPurchase } from "@/lib/purchases/guest-purchase";

// PROJ-11: Die Mails werden hier abgewartet, nicht im Hintergrund
// gestartet. Der Webhook ist ein Server-zu-Server-Aufruf (niemand wartet
// auf die Antwort), und nur so ist sicher, dass der Versand nicht nach der
// Antwort abgebrochen wird. Die Send-Helper werfen nicht; Fehler landen im
// Server-Log. Ein Mail-Fehler darf den Webhook nicht scheitern lassen —
// Projekt und Zahlung sind zu diesem Zeitpunkt schon gespeichert.

/**
 * Link zur Stripe-Rechnung. `session.invoice` ist eine Rechnungs-ID (bzw.
 * ein Objekt), keine URL — und nur gesetzt, wenn der Checkout Rechnungen
 * erzeugt. Ohne Rechnung bleibt der Hinweis in der Mail weg.
 */
async function resolveInvoiceUrl(
  session: Stripe.Checkout.Session,
): Promise<string | undefined> {
  const invoice = session.invoice;
  if (!invoice) return undefined;
  if (typeof invoice !== "string") return invoice.hosted_invoice_url ?? undefined;
  try {
    const retrieved = await getStripe().invoices.retrieve(invoice);
    return retrieved.hosted_invoice_url ?? undefined;
  } catch (err) {
    console.error(
      `[stripe-webhook] invoice lookup failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

/**
 * Alle anderen Mitglieder eines Projekts mit Mail-Adresse — Empfänger der
 * Info-Mail, wenn jemand den Zugang verlängert hat.
 */
async function resolveOtherMembers(
  supabase: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  exceptUserId: string,
): Promise<Array<{ email: string; fullName: string | null }>> {
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .limit(50);
  const result: Array<{ email: string; fullName: string | null }> = [];
  for (const member of members ?? []) {
    if (member.user_id === exceptUserId) continue;
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", member.user_id)
      .maybeSingle();
    if (profile?.email) result.push({ email: profile.email, fullName: profile.full_name ?? null });
  }
  return result;
}

async function resolveBuyerEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  userId: string,
): Promise<{ email: string | null; fullName: string | null }> {
  // Priorität: Stripe customer_details (vom Käufer eingegeben), dann
  // session-Metadata, dann profiles-Row.
  const stripeEmail =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    null;
  if (stripeEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    return { email: stripeEmail, fullName: profile?.full_name ?? null };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    email: profile?.email ?? null,
    fullName: profile?.full_name ?? null,
  };
}

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
  const productType = meta.product_type as ProductType | "vapi" | undefined;
  const userId = meta.user_id as string | undefined;

  // Kauf ohne Konto (2026-11-16): Die Zahlung ist da, aber es gibt noch
  // niemanden, dem das Projekt gehören könnte. Wir halten den Kauf als
  // offenen Anspruch fest und bitten per Mail, das Konto anzulegen. Das
  // Projekt entsteht beim Einlösen (/kauf-einloesen).
  if (isGuestSession(session)) {
    try {
      const recorded = await recordGuestPurchase(supabase, session);
      if (recorded === "invalid") {
        return NextResponse.json(
          { received: true, error: "invalid_guest_metadata" },
          { status: 200 },
        );
      }
      if (recorded === "duplicate") {
        return NextResponse.json({ received: true, duplicate: true });
      }
    } catch (err) {
      // DB-Fehler → 500, Stripe wiederholt den Aufruf.
      const msg = err instanceof Error ? err.message : String(err);
      return new NextResponse(`Internal error: ${msg}`, { status: 500 });
    }
    await sendGuestConfirmation(session, meta);
    return NextResponse.json({ received: true, processed: "guest_initial" });
  }

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
      // Das Vapi-Top-Up ist seit 2026-10-13 kein kaufbares Produkt mehr
      // (PROJ-6-Rückbau). Altereignisse quittieren wir ohne State-Update,
      // damit Stripe nicht endlos retried.
      console.warn(
        `[stripe-webhook] retired product "vapi" ignored (session ${session.id})`,
      );
      return NextResponse.json(
        { received: true, ignored: "retired_product", productType },
        { status: 200 },
      );
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
  // Projekt, Zugang, Mitgliedschaft, Einladung und Zahlungs-Eintrag —
  // dieselbe Erfüllung wie beim Einlösen eines Kaufs ohne Konto.
  const { projectId, expiresAt, buyerIsMember, invitation } = await fulfillInitialPurchase(supabase, {
    userId,
    stripeSessionId: session.id,
    amountCents: session.amount_total,
    currency: session.currency,
    meta,
  });

  // PROJ-11: Einladung an die beschenkte Person + Kauf-Bestätigung an
  // den Käufer (auch ohne eigenen Zugang, dann als Geschenk-Variante).
  try {
    const buyer = await resolveBuyerEmail(supabase, session, userId);
    const mails: Array<Promise<void>> = [];

    if (invitation) {
      mails.push(
        sendInvitationMail({
          to: invitation.email,
          inviterName: buyer.fullName ?? "",
          inviterEmail: buyer.email ?? "",
          projectName: PROJECT_DEFAULT_TITLE,
          role: invitation.role,
          token: invitation.token,
          isGift: true,
        }),
      );
    }

    if (buyer.email) {
      mails.push(
        sendPortalPurchaseMail({
          to: buyer.email,
          fullName: buyer.fullName ?? undefined,
          amountFormatted: formatEur(
            session.amount_total ?? PRODUCTS.initial.amountCents,
            (session.currency ?? PRODUCTS.initial.currency).toUpperCase(),
          ),
          paymentDateFormatted: formatGermanDate(Date.now()),
          expiresAtFormatted: formatGermanDate(expiresAt),
          invoiceUrl: await resolveInvoiceUrl(session),
          projectId,
          giftRecipientEmail: invitation ? invitation.email : undefined,
          // Geschenk „Nur per Sprachnachricht erzählen": keine Einladung,
          // die Mail nennt die beschenkte Person beim Namen (wie Mail 03).
          giftRecipientName:
            meta.is_gift === "1" && !invitation
              ? meta.gift_recipient_name?.trim() || undefined
              : undefined,
          buyerHasAccess: buyerIsMember,
        }),
      );
    }

    await Promise.all(mails);
  } catch (err) {
    console.error(
      `[stripe-webhook] purchase mails failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Kauf ohne Konto: Bitte um Konto-Anlage ───────────────────────────

async function sendGuestConfirmation(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  try {
    const to =
      session.customer_details?.email?.trim() || session.customer_email?.trim() || null;
    if (!to) {
      console.error(`[stripe-webhook] guest session ${session.id} has no buyer email`);
      return;
    }
    await sendGuestPurchaseMail({
      to,
      fullName: meta.full_name?.trim() || undefined,
      amountFormatted: formatEur(
        session.amount_total ?? PRODUCTS.initial.amountCents,
        (session.currency ?? PRODUCTS.initial.currency).toUpperCase(),
      ),
      paymentDateFormatted: formatGermanDate(Date.now()),
      isGift: meta.is_gift === "1",
      invoiceUrl: await resolveInvoiceUrl(session),
    });
  } catch (err) {
    console.error(
      `[stripe-webhook] guest mail failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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

  // PROJ-11: Bestätigung an die Person, die verlängert hat, und Info an
  // alle anderen Projektmitglieder (Jakob, 2026-11-19: verlängern kann
  // jedes Mitglied, z. B. die beschenkte Person — die Information muss in
  // beide Richtungen fließen).
  try {
    const buyer = await resolveBuyerEmail(supabase, session, userId);
    const others = await resolveOtherMembers(supabase, projectId, userId);
    const newExpiresAtFormatted = formatGermanDate(newExpiresAt);
    // Beide Fassungen nennen das Projekt in der Detail-Box (wie Mail 09).
    const { data: project } = await supabase
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();
    const projectName = project?.title?.trim() || PROJECT_DEFAULT_TITLE;
    const mails: Array<Promise<void>> = [];

    if (buyer.email) {
      mails.push(
        sendRenewalMail({
          to: buyer.email,
          fullName: buyer.fullName ?? undefined,
          projectName,
          projectId,
          amountFormatted: formatEur(
            session.amount_total ?? PRODUCTS.renewal.amountCents,
            (session.currency ?? PRODUCTS.renewal.currency).toUpperCase(),
          ),
          paymentDateFormatted: formatGermanDate(Date.now()),
          newExpiresAtFormatted,
          invoiceUrl: await resolveInvoiceUrl(session),
        }),
      );
    }

    const renewedBy = buyer.fullName?.trim() || buyer.email || "Ein Projektmitglied";
    for (const member of others) {
      mails.push(
        sendRenewalInfoMail({
          to: member.email,
          fullName: member.fullName ?? undefined,
          renewedBy,
          projectName,
          projectId,
          newExpiresAtFormatted,
        }),
      );
    }

    await Promise.all(mails);
  } catch (err) {
    console.error(
      `[stripe-webhook] renewal mail failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
