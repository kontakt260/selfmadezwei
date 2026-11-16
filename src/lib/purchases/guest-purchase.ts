import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { PRODUCTS } from "@/lib/stripe/server";
import { sendInvitationMail } from "@/lib/email/send-invitation";
import {
  claimHashesEqual,
  hashClaimToken,
  isClaimTokenHash,
  type ClaimCookie,
} from "./claim-token";
import { fulfillInitialPurchase, PROJECT_DEFAULT_TITLE } from "./fulfill-initial";

// Käufe ohne Konto (PROJ-6, Checkout vor Login/Registrierung, 2026-11-16).
//
// Ablauf:
//   1. Gast startet den Checkout → Stripe-Metadata trägt `guest: "1"` und
//      den Hash eines Einlöse-Geheimnisses, das nur sein Browser kennt.
//   2. Webhook: `recordGuestPurchase` legt den bezahlten Kauf in
//      `purchase_claims` ab. Es entsteht noch KEIN Projekt.
//   3. Sobald der Käufer angemeldet ist: `claimGuestPurchases` ordnet den
//      Kauf seinem Konto zu und erfüllt ihn (Projekt, Zugang, Einladung).
//
// Einlösen darf, wer
//   (a) mit der BESTÄTIGTEN E-Mail-Adresse aus dem Checkout angemeldet ist,
//   (b) oder das Einlöse-Geheimnis aus dem Käufer-Browser vorlegt.
// Alle Prüfungen laufen hier, serverseitig, über die Service-Role.

type ServiceClient = SupabaseClient<Database>;
type ClaimRow = Database["public"]["Tables"]["purchase_claims"]["Row"];

const MAX_CLAIMS_PER_RUN = 10;

/** Erstkauf, der ohne Anmeldung gestartet wurde. */
export function isGuestSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const meta = session.metadata ?? {};
  return meta.guest === "1" && meta.product_type === "initial" && !meta.user_id;
}

function buyerEmailOf(session: Stripe.Checkout.Session): string | null {
  const email = session.customer_details?.email?.trim() || session.customer_email?.trim() || "";
  return email ? email.toLowerCase() : null;
}

/**
 * Legt einen bezahlten Gast-Kauf als offenen Anspruch ab.
 * Idempotent über die eindeutige `stripe_session_id`.
 */
export async function recordGuestPurchase(
  supabase: ServiceClient,
  session: Stripe.Checkout.Session,
): Promise<"created" | "duplicate" | "invalid"> {
  const meta = session.metadata ?? {};
  if (!isGuestSession(session) || !isClaimTokenHash(meta.claim_hash)) return "invalid";

  // Angaben aus dem Kauf-Assistenten übernehmen — ohne die technischen
  // Felder, die nur der Zuordnung dienen.
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === "guest" || key === "claim_hash") continue;
    if (typeof value === "string") metadata[key] = value;
  }

  const { error } = await supabase.from("purchase_claims").insert({
    stripe_session_id: session.id,
    buyer_email: buyerEmailOf(session),
    claim_token_hash: meta.claim_hash,
    metadata: metadata as Json,
    amount_cents: session.amount_total ?? PRODUCTS.initial.amountCents,
    currency: (session.currency ?? PRODUCTS.initial.currency).toLowerCase(),
  });
  if (!error) return "created";
  // 23505 = unique_violation → der Kauf ist schon erfasst.
  if (error.code === "23505") return "duplicate";
  throw new Error(error.message);
}

export type ClaimUser = {
  id: string;
  email: string | null;
  /** Nur eine bestätigte Adresse berechtigt zum Einlösen per E-Mail. */
  emailConfirmed: boolean;
};

/** Gibt es einen offenen Kauf zur bestätigten E-Mail-Adresse des Kontos? */
export async function hasOpenClaimForEmail(
  supabase: ServiceClient,
  user: ClaimUser,
): Promise<boolean> {
  const email = user.emailConfirmed ? user.email?.trim().toLowerCase() : null;
  if (!email) return false;
  const { data, error } = await supabase
    .from("purchase_claims")
    .select("id")
    .eq("buyer_email", email)
    .is("claimed_at", null)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export type ClaimOutcome = {
  /** Erfolgreich eingelöste Käufe. */
  claimed: Array<{ stripeSessionId: string; projectId: string }>;
  /** Käufe, die gefunden wurden, deren Erfüllung aber scheiterte. */
  failed: number;
  /**
   * true, wenn das Cookie-Geheimnis verbraucht ist (sein Kauf ist
   * eingelöst) — der Aufrufer löscht dann das Cookie.
   */
  cookieSpent: boolean;
};

export type ClaimInput = {
  user: ClaimUser;
  /** Einlöse-Cookie aus dem Browser, falls vorhanden. */
  cookie: ClaimCookie | null;
  /**
   * Holt eine Checkout-Session von Stripe. Wird nur gebraucht, wenn der
   * Webhook noch nicht eingetroffen ist (Stripe garantiert keine
   * Reihenfolge zwischen Rückleitung und Webhook).
   */
  retrieveSession: (sessionId: string) => Promise<Stripe.Checkout.Session | null>;
};

export async function claimGuestPurchases(
  supabase: ServiceClient,
  { user, cookie, retrieveSession }: ClaimInput,
): Promise<ClaimOutcome> {
  const tokenHash = cookie ? hashClaimToken(cookie.token) : null;
  // Checkout abgebrochen und bei Stripe verfallen → das Cookie ist wertlos.
  let cookieSessionExpired = false;

  // Webhook noch nicht da? Dann den Kauf direkt bei Stripe prüfen und
  // selbst erfassen — sonst sähe ein schneller Käufer „kein Kauf gefunden".
  if (cookie && tokenHash) {
    const { data: known, error } = await supabase
      .from("purchase_claims")
      .select("id")
      .eq("stripe_session_id", cookie.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!known) {
      const session = await retrieveSession(cookie.sessionId).catch(() => null);
      if (session?.status === "expired") cookieSessionExpired = true;
      if (
        session &&
        session.status === "complete" &&
        session.payment_status === "paid" &&
        isGuestSession(session) &&
        claimHashesEqual(session.metadata?.claim_hash ?? "", tokenHash)
      ) {
        await recordGuestPurchase(supabase, session);
      }
    }
  }

  // Offene Käufe sammeln: per bestätigter E-Mail und per Geheimnis.
  const candidates = new Map<string, ClaimRow>();
  const email = user.emailConfirmed ? user.email?.trim().toLowerCase() : null;
  if (email) {
    const { data, error } = await supabase
      .from("purchase_claims")
      .select("*")
      .eq("buyer_email", email)
      .is("claimed_at", null)
      .order("paid_at", { ascending: true })
      .limit(MAX_CLAIMS_PER_RUN);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) candidates.set(row.id, row);
  }
  if (tokenHash) {
    const { data, error } = await supabase
      .from("purchase_claims")
      .select("*")
      .eq("claim_token_hash", tokenHash)
      .is("claimed_at", null)
      .limit(MAX_CLAIMS_PER_RUN);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) candidates.set(row.id, row);
  }

  const outcome: ClaimOutcome = { claimed: [], failed: 0, cookieSpent: false };

  for (const row of candidates.values()) {
    // Atomare Sperre: nur EIN Aufruf gewinnt (zwei Tabs, doppelter Klick,
    // zwei Personen mit Anspruch auf denselben Kauf).
    const { data: locked, error: lockErr } = await supabase
      .from("purchase_claims")
      .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("claimed_at", null)
      .select("id")
      .maybeSingle();
    if (lockErr) throw new Error(lockErr.message);
    if (!locked) continue;

    const meta = toStringRecord(row.metadata);
    let result: Awaited<ReturnType<typeof fulfillInitialPurchase>>;
    try {
      result = await fulfillInitialPurchase(supabase, {
        userId: user.id,
        stripeSessionId: row.stripe_session_id,
        amountCents: row.amount_cents,
        currency: row.currency,
        meta,
      });
    } catch (err) {
      // Erfüllung gescheitert → Sperre lösen, damit ein erneuter Versuch
      // möglich ist. Die Zahlung bleibt als offener Anspruch erhalten.
      outcome.failed += 1;
      console.error(
        `[purchases] claim of session ${row.stripe_session_id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await supabase
        .from("purchase_claims")
        .update({ claimed_by: null, claimed_at: null })
        .eq("id", row.id);
      continue;
    }

    await supabase
      .from("purchase_claims")
      .update({ project_id: result.projectId })
      .eq("id", row.id);
    outcome.claimed.push({
      stripeSessionId: row.stripe_session_id,
      projectId: result.projectId,
    });

    // Geschenk: Die Einladung an die beschenkte Person geht jetzt raus —
    // vorher gab es kein Projekt, in das sie hätte eintreten können. Ein
    // Mail-Fehler ändert nichts daran, dass der Kauf eingelöst ist.
    if (result.invitation) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        await sendInvitationMail({
          to: result.invitation.email,
          inviterName: profile?.full_name ?? meta.full_name ?? "",
          inviterEmail: user.email ?? "",
          projectName: PROJECT_DEFAULT_TITLE,
          role: result.invitation.role,
          token: result.invitation.token,
          isGift: true,
        });
      } catch (err) {
        console.error(
          `[purchases] gift invitation for session ${row.stripe_session_id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (cookie) {
    if (outcome.claimed.some((c) => c.stripeSessionId === cookie.sessionId)) {
      outcome.cookieSpent = true;
    } else {
      const { data: row } = await supabase
        .from("purchase_claims")
        .select("claimed_at")
        .eq("stripe_session_id", cookie.sessionId)
        .maybeSingle();
      outcome.cookieSpent = !!row?.claimed_at || cookieSessionExpired;
    }
  }

  return outcome;
}

function toStringRecord(value: Json): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") out[key] = entry;
    }
  }
  return out;
}
