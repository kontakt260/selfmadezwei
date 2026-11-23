import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { isValidEmail, normalizeMobileNumber } from "@/lib/onboarding/wizard";

// PROJ-24: Kontaktdaten auf dem Weg durch den Kauf.
//
// Stripe speichert Metadaten dauerhaft, auch bei abgebrochenen Käufen. Die
// Daten einer dritten Person (Erzähl-Kontakte, Adresse für die
// Geschenk-Einladung) liegen deshalb in einer kurzlebigen Kauf-Vorbereitung,
// Stripe kennt nur deren zufällige Kennung.
//
// Grundregel: Erzähl-Kontakte verhindern nie einen Kauf. Fehler werden geloggt
// (ohne Kontaktdaten), das Projekt gilt dann als „nicht eingerichtet". Nur die
// Geschenk-Adresse ist Pflicht: Ohne sie startet der Checkout gar nicht erst,
// sonst wäre bezahlt, aber niemand eingeladen.

type ServiceClient = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wie lange eine Kauf-Vorbereitung je Zustand höchstens bleibt. */
export const NARRATION_DRAFT_MAX_AGE_DAYS = {
  open: 2,
  payment_pending: 21,
  paid: 90,
} as const;

export const narrationInputSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(["email", "sms", "both"]),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
});
export type NarrationInput = z.infer<typeof narrationInputSchema>;

export type NarrationDraftValues = {
  narrator_name: string;
  channel: NarrationInput["channel"];
  email: string | null;
  phone: string | null;
  uses_checkout_email: boolean;
};

export type NarrationDraftContext = {
  narration?: NarrationInput;
  fullName: string;
  isGift: boolean;
  giftMode?: "phone-only" | "phone-plus-computer";
  giftRecipientName?: string;
  isGuest: boolean;
};

/** Prüft die Angaben serverseitig und behält nur, was der gewählte Weg braucht. */
export function buildNarrationDraft(
  context: NarrationDraftContext,
): { ok: true; draft: NarrationDraftValues | null } | { ok: false } {
  const { narration, isGift, giftMode, isGuest } = context;
  const required = isGift && giftMode === "phone-only";
  if (!narration?.enabled) return required ? { ok: false } : { ok: true, draft: null };

  const narratorName = (isGift ? context.giftRecipientName : context.fullName)?.trim() ?? "";
  if (!narratorName || narratorName.length > 120) return { ok: false };

  const usesEmail = narration.channel !== "sms";
  const usesSms = narration.channel !== "email";
  const usesCheckoutEmail = usesEmail && !isGift && isGuest;

  let email: string | null = null;
  if (usesEmail && !usesCheckoutEmail) {
    const value = narration.email?.trim().toLowerCase() ?? "";
    if (!isValidEmail(value)) return { ok: false };
    email = value;
  }

  let phone: string | null = null;
  if (usesSms) {
    phone = normalizeMobileNumber(narration.phone ?? "");
    if (!phone) return { ok: false };
  }

  return {
    ok: true,
    draft: {
      narrator_name: narratorName,
      channel: narration.channel,
      email,
      phone,
      uses_checkout_email: usesCheckoutEmail,
    },
  };
}

function logFailure(step: string, err: unknown) {
  console.error(
    `[narration-draft] ${step} failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

const NO_NARRATION = {
  narrator_name: null,
  channel: null,
  email: null,
  phone: null,
  uses_checkout_email: false,
};

/** Legt die Kauf-Vorbereitung an. `null` heißt: Sie konnte nicht gespeichert werden. */
export async function createNarrationDraft(
  supabase: ServiceClient,
  values: NarrationDraftValues | null,
  giftRecipientEmail: string | null = null,
): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from("purchase_narration_drafts")
      .insert({ id, ...(values ?? NO_NARRATION), gift_recipient_email: giftRecipientEmail });
    if (error) throw new Error(error.message);
    return id;
  } catch (err) {
    logFailure("create", err);
    return null;
  }
}

/**
 * Verlängert die Frist, sobald die Zahlung läuft oder der Kauf bezahlt ist.
 * Stripe garantiert keine Reihenfolge: Ein spätes „unbezahlt" ändert deshalb
 * nur eine noch offene Vorbereitung und verkürzt nie die Frist eines Kaufs.
 */
export async function markNarrationDraft(
  supabase: ServiceClient,
  draftId: string | null | undefined,
  status: "payment_pending" | "paid",
): Promise<void> {
  if (!draftId) return;
  try {
    const update = supabase
      .from("purchase_narration_drafts")
      .update({ status, status_changed_at: new Date().toISOString() })
      .eq("id", draftId);
    const { error } = await (status === "payment_pending" ? update.eq("status", "open") : update);
    if (error) throw new Error(error.message);
  } catch (err) {
    logFailure("mark", err);
  }
}

/**
 * Überträgt die Kauf-Vorbereitung ans neue Projekt. Die Vorbereitung selbst
 * bleibt bestehen, bis der Kauf vollständig erfüllt ist, damit ein wiederholter
 * Webhook sie noch findet.
 */
export async function applyNarrationDraft(
  supabase: ServiceClient,
  input: { draftId: string | null | undefined; projectId: string; buyerEmail: string | null },
): Promise<void> {
  if (!input.draftId) return;
  try {
    const { data: draft, error } = await supabase
      .from("purchase_narration_drafts")
      .select("narrator_name, channel, email, phone, uses_checkout_email")
      .eq("id", input.draftId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!draft) {
      console.warn(`[narration-draft] no draft for project ${input.projectId}`);
      return;
    }
    // Nur die Geschenk-Adresse gespeichert: Erzähl-Impulse sind nicht gewünscht.
    if (!draft.narrator_name || !draft.channel) return;

    const email = draft.uses_checkout_email
      ? input.buyerEmail?.trim().toLowerCase() || null
      : draft.email;
    // Fehlt die Adresse aus dem Checkout, bleibt bei „beides" noch die SMS.
    const channel = draft.channel === "both" && !email ? "sms" : draft.channel;
    if (channel === "email" && !email) {
      console.warn(`[narration-draft] no email for project ${input.projectId}`);
      return;
    }

    const { error: insertError } = await supabase.from("narration_settings").insert({
      project_id: input.projectId,
      narrator_name: draft.narrator_name,
      channel,
      email: channel === "sms" ? null : email,
      phone: channel === "email" ? null : draft.phone,
    });
    if (insertError) throw new Error(insertError.message);
  } catch (err) {
    logFailure("apply", err);
  }
}

/**
 * Adresse für die Geschenk-Einladung. Käufe von vor BUG-3 tragen sie noch in
 * den Metadaten. Ein Datenbankfehler wird geworfen, damit Stripe die Erfüllung
 * wiederholt, statt das Geschenk ohne Einladung abzuschließen.
 */
export async function readGiftRecipientEmail(
  supabase: ServiceClient,
  meta: Record<string, string | undefined>,
): Promise<string | null> {
  const fromMetadata = meta.gift_recipient_email?.trim();
  if (fromMetadata) return fromMetadata;
  const draftId = meta.narration_draft;
  if (!draftId || !UUID_PATTERN.test(draftId)) return null;
  const { data, error } = await supabase
    .from("purchase_narration_drafts")
    .select("gift_recipient_email")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.gift_recipient_email ?? null;
}

/**
 * Adresse für die Bestätigungsseite: vor der Erfüllung aus der Vorbereitung,
 * danach aus der Einladung. Leer, wenn sie nicht mehr zu finden ist.
 */
export async function findGiftRecipientEmail(
  supabase: ServiceClient,
  input: { stripeSessionId: string; meta: Record<string, string | undefined> },
): Promise<string> {
  try {
    const pending = await readGiftRecipientEmail(supabase, input.meta);
    if (pending) return pending;
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("project_id")
      .eq("stripe_session_id", input.stripeSessionId)
      .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment?.project_id) return "";
    const { data: invitations, error: invitationError } = await supabase
      .from("invitations")
      .select("email")
      .eq("project_id", payment.project_id)
      .eq("is_gift", true)
      .order("created_at", { ascending: true })
      .limit(1);
    if (invitationError) throw new Error(invitationError.message);
    return invitations?.[0]?.email ?? "";
  } catch (err) {
    logFailure("find gift email", err);
    return "";
  }
}

export async function removeNarrationDraft(
  supabase: ServiceClient,
  draftId: string | null | undefined,
): Promise<void> {
  if (!draftId) return;
  try {
    const { error } = await supabase.from("purchase_narration_drafts").delete().eq("id", draftId);
    if (error) throw new Error(error.message);
  } catch (err) {
    logFailure("remove", err);
  }
}

/** Täglicher Cron: löscht Kauf-Vorbereitungen, deren Frist abgelaufen ist. */
export async function purgeExpiredNarrationDrafts(
  supabase: ServiceClient,
  now: number = Date.now(),
): Promise<{ removed: number }> {
  let removed = 0;
  for (const [status, days] of Object.entries(NARRATION_DRAFT_MAX_AGE_DAYS)) {
    const cutoff = new Date(now - days * DAY_MS).toISOString();
    const { data, error } = await supabase
      .from("purchase_narration_drafts")
      .delete()
      .eq("status", status)
      .lt("status_changed_at", cutoff)
      .select("id");
    if (error) throw new Error(error.message);
    removed += data?.length ?? 0;
  }
  return { removed };
}
