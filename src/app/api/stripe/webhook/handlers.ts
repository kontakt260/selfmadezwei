import type Stripe from "stripe";
import { getStripe, PRODUCTS } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendPortalPurchaseMail } from "@/lib/email/send-portal-purchase";
import { sendRenewalInfoMail, sendRenewalMail } from "@/lib/email/send-renewal";
import { sendInvitationMail } from "@/lib/email/send-invitation";
import { sendGuestPurchaseMail } from "@/lib/email/send-guest-purchase";
import { sendDeletedProjectPaymentAlert } from "@/lib/email/send-deleted-project-alert";
import { isProjectInTrash, restorePaidProject, type PaidRestoreStatus } from "@/lib/projects/trash";
import { formatEur, formatGermanDate } from "@/lib/email/format";
import { fulfillInitialPurchase, PROJECT_DEFAULT_TITLE } from "@/lib/purchases/fulfill-initial";
import { addTwelveMonths } from "@/lib/purchases/access-period";

// PROJ-11: Die Mails werden hier abgewartet, nicht im Hintergrund
// gestartet. Der Webhook ist ein Server-zu-Server-Aufruf (niemand wartet
// auf die Antwort), und nur so ist sicher, dass der Versand nicht nach der
// Antwort abgebrochen wird. Die Send-Helper werfen nicht. Ein Mail-Fehler
// darf den Webhook nicht scheitern lassen — Projekt und Zahlung sind zu
// diesem Zeitpunkt schon gespeichert. Gescheiterte Mails landen in der
// Warteschlange und werden vom täglichen Cron nachgeholt (BUG-13).

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

// ─── Initial-Kauf (249 €) ─────────────────────────────────────────────

export async function handleInitial(
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
    buyerEmail: session.customer_details?.email ?? session.customer_email ?? null,
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

// ─── Geschenk ohne eigenen Zugang und ohne Konto ──────────────────────

export async function handleDirectGift(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const { projectId, expiresAt, invitation } = await fulfillInitialPurchase(supabase, {
    userId: null,
    stripeSessionId: session.id,
    amountCents: session.amount_total,
    currency: session.currency,
    meta,
    buyerEmail: session.customer_details?.email ?? session.customer_email ?? null,
  });

  // Einladung an die beschenkte Person + Bestätigung an den Käufer (Mail 04).
  // Ein Mail-Fehler ändert nichts daran, dass der Kauf erfüllt ist.
  try {
    const buyerEmail =
      session.customer_details?.email?.trim() || session.customer_email?.trim() || null;
    const buyerName = meta.full_name?.trim() || "";
    const mails: Array<Promise<void>> = [];
    if (invitation) {
      mails.push(
        sendInvitationMail({
          to: invitation.email,
          inviterName: buyerName,
          inviterEmail: buyerEmail ?? "",
          projectName: PROJECT_DEFAULT_TITLE,
          role: invitation.role,
          token: invitation.token,
          isGift: true,
        }),
      );
    }
    if (buyerEmail) {
      mails.push(
        sendPortalPurchaseMail({
          to: buyerEmail,
          fullName: buyerName || undefined,
          amountFormatted: formatEur(
            session.amount_total ?? PRODUCTS.initial.amountCents,
            (session.currency ?? PRODUCTS.initial.currency).toUpperCase(),
          ),
          paymentDateFormatted: formatGermanDate(Date.now()),
          expiresAtFormatted: formatGermanDate(expiresAt),
          invoiceUrl: await resolveInvoiceUrl(session),
          projectId,
          giftRecipientEmail: invitation?.email,
          buyerHasAccess: false,
        }),
      );
    }
    await Promise.all(mails);
  } catch (err) {
    console.error(
      `[stripe-webhook] gift mails failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Kauf ohne Konto: Bitte um Konto-Anlage ───────────────────────────

export async function sendGuestConfirmation(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
  claimCode: string,
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
      stripeSessionId: session.id,
      fullName: meta.full_name?.trim() || undefined,
      amountFormatted: formatEur(
        session.amount_total ?? PRODUCTS.initial.amountCents,
        (session.currency ?? PRODUCTS.initial.currency).toUpperCase(),
      ),
      paymentDateFormatted: formatGermanDate(Date.now()),
      isGift: meta.is_gift === "1",
      invoiceUrl: await resolveInvoiceUrl(session),
      claimCode,
    });
  } catch (err) {
    console.error(
      `[stripe-webhook] guest mail failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Portal-Verlängerung (99 €) ───────────────────────────────────────

export async function handleRenewal(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
  userId: string,
) {
  const projectId = meta.project_id?.trim();
  if (!projectId) throw new Error("renewal: missing project_id in metadata");

  // Zuerst die Zahlung eintragen: `stripe_session_id` ist eindeutig, damit
  // verlängert genau eine Zustellung dieses Events (BUG-G5). Vorher hätte ein
  // Stripe-Retry nach einem Fehler weitere 12 Monate gutgeschrieben.
  const payment = {
    project_id: projectId as string | null,
    user_id: userId as string | null,
    stripe_session_id: session.id,
    type: PRODUCTS.renewal.paymentType,
    amount_cents: session.amount_total ?? PRODUCTS.renewal.amountCents,
    currency: (session.currency ?? PRODUCTS.renewal.currency).toLowerCase(),
    status: "completed" as const,
  };
  const { error: payErr } = await supabase.from("payments").insert(payment);
  if (payErr) {
    // 23505 = unique_violation → eine parallele Zustellung war schneller.
    if (payErr.code === "23505") return;
    if (payErr.code !== "23503") throw new Error(payErr.message);

    // PROJ-26: 23503 = Projekt oder Konto gibt es nicht mehr. Das Geld ist
    // trotzdem da, die Zahlung muss also gebucht werden.
    const [projectLookup, buyerLookup] = await Promise.all([
      supabase.from("projects").select("id").eq("id", projectId).maybeSingle(),
      supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
    ]);
    if (projectLookup.error) throw new Error(projectLookup.error.message);
    if (buyerLookup.error) throw new Error(buyerLookup.error.message);

    const { error: retryErr } = await supabase.from("payments").insert({
      ...payment,
      project_id: projectLookup.data ? projectId : null,
      user_id: buyerLookup.data ? userId : null,
    });
    if (retryErr) {
      if (retryErr.code === "23505") return;
      throw new Error(retryErr.message);
    }

    if (!projectLookup.data) {
      await sendDeletedProjectPaymentAlert({
        projectId,
        stripeSessionId: session.id,
        finallyDeleted: true,
      });
      return;
    }
  }

  // Aktuellen expires_at lesen (default = now() falls neu).
  const { data: access, error: accessReadErr } = await supabase
    .from("project_access")
    .select("expires_at")
    .eq("project_id", projectId)
    .maybeSingle();

  const baseTime =
    access?.expires_at && new Date(access.expires_at).getTime() > Date.now()
      ? new Date(access.expires_at).getTime()
      : Date.now();
  const newExpiresAt = addTwelveMonths(baseTime).toISOString();

  // UPSERT in project_access (Webhook ist service_role → RLS bypass).
  const accessWrite = accessReadErr
    ? { error: accessReadErr }
    : await supabase
        .from("project_access")
        .upsert(
          { project_id: projectId, expires_at: newExpiresAt },
          { onConflict: "project_id" },
        );
  if (accessWrite.error) {
    // Zahlung wieder austragen, sonst hielte der Retry den Kauf für erledigt
    // und der Kunde bekäme seine Verlängerung nie.
    const { error: rollbackErr } = await supabase
      .from("payments")
      .delete()
      .eq("stripe_session_id", session.id);
    if (rollbackErr) {
      console.error(
        `[stripe-webhook] renewal rollback failed for session ${session.id}: ${rollbackErr.message}`,
      );
    }
    throw new Error(accessWrite.error.message);
  }

  // PROJ-28: Lag das Projekt wegen Ablauf im Papierkorb, holt die Zahlung es
  // zurück. Hat eine Person es gelöscht (PROJ-26), bleibt die Zahlung gebucht
  // und der Support klärt den Fall. Die Person bekommt dann keine Mail
  // „verlängert" für ein Projekt, das sie gerade nicht öffnen kann.
  let restore: PaidRestoreStatus | "check_failed";
  try {
    restore = await restorePaidProject(supabase, projectId);
  } catch (err) {
    console.error(
      `[stripe-webhook] trash check failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    const inTrash = await isProjectInTrash(supabase, projectId).catch(() => true);
    restore = inTrash ? "check_failed" : "not_in_trash";
  }

  if (restore === "gone") {
    await sendDeletedProjectPaymentAlert({
      projectId,
      stripeSessionId: session.id,
      finallyDeleted: true,
    });
    return;
  }
  if (restore !== "restored" && restore !== "not_in_trash") {
    await sendDeletedProjectPaymentAlert({ projectId, stripeSessionId: session.id });
    return;
  }

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

    // Nacheinander, damit große Projekte nicht ins Resend-Limit laufen.
    if (buyer.email) {
      await sendRenewalMail({
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
      });
    }

    const renewedBy = buyer.fullName?.trim() || buyer.email || "Ein Projektmitglied";
    for (const member of others) {
      await sendRenewalInfoMail({
        to: member.email,
        fullName: member.fullName ?? undefined,
        renewedBy,
        projectName,
        projectId,
        newExpiresAtFormatted,
      });
    }
  } catch (err) {
    console.error(
      `[stripe-webhook] renewal mail failed for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
