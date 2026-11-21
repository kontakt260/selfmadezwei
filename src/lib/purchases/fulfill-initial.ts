import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PRODUCTS } from "@/lib/stripe/server";
import { addTwelveMonths } from "./access-period";

// Erfüllung eines bezahlten Erstkaufs (PROJ-6): Projekt, Zugang,
// Mitgliedschaft, ggf. Einladung, Zahlungs-Eintrag.
//
// Zwei Aufrufer:
//   - Stripe-Webhook, wenn der Käufer beim Kauf angemeldet war.
//   - Einlösen eines Gast-Kaufs, sobald der Käufer ein Konto hat
//     (src/lib/purchases/guest-purchase.ts).
//   - Stripe-Webhook beim Geschenk ohne eigenen Zugang und ohne Konto
//     (`userId = null`): Das Projekt hat bis zur Annahme der Einladung keinen
//     Eigentümer, die beschenkte Person wird Projektleiter.
//
// Reine Datenbank-Arbeit über die Service-Role. Mails verschickt der
// Aufrufer — er weiß, welche schon unterwegs sind.


// Geschenk-Einladungen gelten so lange wie der Portal-Zugang des Projekts
// (Entscheidung 2026-11-18) — nicht 14 Tage wie normale Einladungen
// (PROJ-9). Geschenke werden oft lange vor der Übergabe gekauft, und
// verzichtet der Käufer auf eigenen Zugang, gibt es niemanden, der eine
// abgelaufene Einladung neu verschicken könnte.

/** Titel neuer Projekte; der Projektleiter kann ihn später ändern. */
export const PROJECT_DEFAULT_TITLE = "Lebensgeschichten";

type ServiceClient = SupabaseClient<Database>;
type MemberRole = "projektleiter" | "co_author";

export type InitialPurchaseInput = {
  /**
   * Konto des Käufers — wird Eigentümer des Projekts. `null` nur beim
   * Geschenk ohne eigenen Zugang.
   */
  userId: string | null;
  stripeSessionId: string;
  amountCents: number | null | undefined;
  currency: string | null | undefined;
  /** Angaben aus dem Kauf-Assistenten (Stripe-Metadata). */
  meta: Record<string, string | undefined>;
};

export type InitialPurchaseResult = {
  projectId: string;
  /** Ende des Portal-Zugangs (ISO) — 12 Monate ab Erfüllung. */
  expiresAt: string;
  /** false = Geschenk, bei dem der Käufer auf eigenen Zugang verzichtet. */
  buyerIsMember: boolean;
  /** Einladung an die beschenkte Person, falls eine angelegt wurde — gültig bis `expiresAt`. */
  invitation: { token: string; email: string; role: MemberRole } | null;
};

export async function fulfillInitialPurchase(
  supabase: ServiceClient,
  input: InitialPurchaseInput,
): Promise<InitialPurchaseResult> {
  const { userId, meta } = input;
  const isGift = meta.is_gift === "1";
  const giftMode = meta.gift_mode as "phone-only" | "phone-plus-computer" | undefined;
  const recipientEmail = meta.gift_recipient_email?.trim() || null;
  const recipientRole = (meta.gift_recipient_role as MemberRole | undefined) ?? "co_author";
  const buyerRetainsAccess = meta.buyer_retains_access === "1";

  // Ohne Konto gibt es niemanden, der das Projekt sonst verwalten könnte.
  if (
    userId === null &&
    !(isGift && giftMode === "phone-plus-computer" && !buyerRetainsAccess && recipientEmail)
  ) {
    throw new Error("purchase without account is only possible for a gift without own access");
  }

  // 1. Projekt anlegen.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({ title: PROJECT_DEFAULT_TITLE, owner_id: userId })
    .select("id")
    .single();
  if (projErr || !project) throw new Error(projErr?.message ?? "project insert failed");
  const projectId = project.id;

  try {
    // 2. project_access setzen (12 Monate ab jetzt).
    const expiresAt = addTwelveMonths(Date.now()).toISOString();
    const { error: accessErr } = await supabase
      .from("project_access")
      .insert({ project_id: projectId, expires_at: expiresAt });
    if (accessErr) throw new Error(accessErr.message);

    // 3. project_members befüllen je nach Geschenk-Variante:
    //    - „Für mich selbst": Käufer = projektleiter.
    //    - „Geschenk — Nur erzählen" (gift_mode phone-only): Käufer =
    //      projektleiter (Empfänger erzählt nur per Sprachnachricht; kein
    //      Portal-Login).
    //    - „Geschenk — Auch Computer", Käufer behält Zugang: Käufer =
    //      projektleiter + invitation für Empfänger (co_author).
    //    - „Geschenk — Auch Computer", Käufer verzichtet auf Zugang: KEIN
    //      project_members-Eintrag für Käufer; invitation für Empfänger
    //      (projektleiter).
    let buyerIsMember = true;
    const buyerRole: MemberRole = "projektleiter";
    let inviteRecipient = false;
    let inviteRole: MemberRole = "co_author";

    if (isGift && giftMode === "phone-plus-computer") {
      inviteRecipient = true;
      if (buyerRetainsAccess) {
        inviteRole = recipientRole;
      } else {
        buyerIsMember = false;
        inviteRole = "projektleiter";
      }
    }

    if (buyerIsMember && userId) {
      const { error: memErr } = await supabase
        .from("project_members")
        .insert({ project_id: projectId, user_id: userId, role: buyerRole });
      if (memErr) throw new Error(memErr.message);
    }

    let invitation: InitialPurchaseResult["invitation"] = null;
    if (inviteRecipient && recipientEmail) {
      const token = crypto.randomBytes(32).toString("base64url");
      const email = recipientEmail.toLowerCase();
      const { error: invErr } = await supabase.from("invitations").insert({
        project_id: projectId,
        email,
        role: inviteRole,
        token,
        expires_at: expiresAt,
        is_gift: true,
      });
      if (invErr) throw new Error(invErr.message);
      invitation = { token, email: recipientEmail, role: inviteRole };
    }

    // 4. payments-Eintrag (idempotenz-tragend via UNIQUE stripe_session_id).
    const { error: payErr } = await supabase.from("payments").insert({
      project_id: projectId,
      user_id: userId,
      stripe_session_id: input.stripeSessionId,
      type: PRODUCTS.initial.paymentType,
      amount_cents: input.amountCents ?? PRODUCTS.initial.amountCents,
      currency: (input.currency ?? PRODUCTS.initial.currency).toLowerCase(),
      status: "completed",
    });
    if (payErr) throw new Error(payErr.message);

    return { projectId, expiresAt, buyerIsMember, invitation };
  } catch (err) {
    // Halb angelegtes Projekt wieder entfernen — Zugang, Mitgliedschaft und
    // Einladung hängen per ON DELETE CASCADE daran. Ohne das Aufräumen
    // bliebe bei jedem Wiederholungsversuch (Stripe-Retry, erneutes
    // Einlösen) ein verwaistes Projekt zurück.
    const { error: cleanupErr } = await supabase.from("projects").delete().eq("id", projectId);
    if (cleanupErr) {
      console.error(
        `[purchases] cleanup of project ${projectId} failed: ${cleanupErr.message}`,
      );
    }
    throw err;
  }
}
