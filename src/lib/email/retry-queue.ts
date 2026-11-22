import "server-only";
import type { Json } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { hashEmailForLog, type SendMailResult } from "./client";
import type { SendGuestPurchaseInput } from "./send-guest-purchase";
import type { SendInvitationInput } from "./send-invitation";
import type { SendPortalPurchaseInput } from "./send-portal-purchase";
import type { SendRenewalInfoInput, SendRenewalInput } from "./send-renewal";

// PROJ-11 BUG-13 — Warteschlange für Mails, deren Versand gescheitert ist.
//
// Kauf- und Einladungs-Mails haben keinen zweiten Auslöser: Der Stripe-Webhook
// ist nach dem ersten Lauf erledigt, und beim Geschenk ohne eigenen Zugang
// führt nur die Mail zum Projekt. Deshalb landet jede gescheiterte Mail hier.
// Der tägliche Cron holt sie nach (`retry-mails.ts`).

export type RetryableMail =
  | { kind: "invitation"; input: SendInvitationInput }
  | { kind: "portal_purchase"; input: SendPortalPurchaseInput }
  | { kind: "guest_purchase"; input: SendGuestPurchaseInput }
  | { kind: "renewal"; input: SendRenewalInput }
  | { kind: "renewal_info"; input: SendRenewalInfoInput };

/** Ersatz für den Namen einer Person, die ihr Konto gelöscht hat. */
const ANONYMOUS_GIFT_SENDER = "Jemand aus Ihrem Umfeld";
const ANONYMOUS_MEMBER = "Ein Projektmitglied";

const MAX_ROWS_ON_ACCOUNT_DELETE = 1000;

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Was passiert mit einem Eintrag, wenn diese Person ihr Konto löscht?
 * Mails an sie entfallen. Eine bezahlte Geschenk-Einladung und die Info an
 * andere Mitglieder gehen weiter raus, nur ohne ihren Namen.
 */
function cleanupFor(
  row: { kind: string; payload: Json },
  email: string,
  fullName: string,
): "delete" | Record<string, unknown> | null {
  const payload = row.payload as Record<string, unknown>;
  if (normalized(payload.to) === email) return "delete";

  if (row.kind === "invitation" && normalized(payload.inviterEmail) === email) {
    if (!payload.isGift) return "delete";
    return { ...payload, inviterName: ANONYMOUS_GIFT_SENDER, inviterEmail: "" };
  }
  if (row.kind === "renewal_info") {
    const renewedBy = normalized(payload.renewedBy);
    if (renewedBy === email || (fullName !== "" && renewedBy === fullName)) {
      return { ...payload, renewedBy: ANONYMOUS_MEMBER };
    }
  }
  return null;
}

/**
 * Räumt die Warteschlange beim Löschen eines Kontos auf (BUG-20). Wirft nie:
 * Ein Fehler hier darf die Kontolöschung nicht verhindern.
 */
export async function removeQueuedMailsOfAccount(input: {
  email: string | null | undefined;
  fullName?: string | null;
}): Promise<void> {
  const email = normalized(input.email);
  if (!email) return;
  const fullName = normalized(input.fullName);

  try {
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("mail_retry_queue")
      .select("id, kind, payload")
      .limit(MAX_ROWS_ON_ACCOUNT_DELETE);
    if (error) {
      console.error(`[email/retry-queue] account cleanup failed: ${error.message}`);
      return;
    }

    const toDelete: string[] = [];
    for (const row of rows ?? []) {
      const cleanup = cleanupFor(row, email, fullName);
      if (cleanup === "delete") {
        toDelete.push(row.id);
      } else if (cleanup) {
        const { error: updateError } = await supabase
          .from("mail_retry_queue")
          .update({ payload: cleanup as unknown as Json })
          .eq("id", row.id);
        if (updateError) {
          console.error(`[email/retry-queue] anonymizing ${row.id} failed: ${updateError.message}`);
        }
      }
    }

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("mail_retry_queue")
        .delete()
        .in("id", toDelete);
      if (deleteError) {
        console.error(`[email/retry-queue] account cleanup failed: ${deleteError.message}`);
      }
    }
  } catch (err) {
    console.error(
      `[email/retry-queue] account cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Wertet das Versand-Ergebnis aus: Fehler ins Server-Log (Empfänger gehasht),
 * und wenn ein späterer Versuch klappen kann, in die Warteschlange. Wirft nie.
 */
export async function recordMailResult(
  mail: RetryableMail,
  result: SendMailResult,
): Promise<void> {
  if (result.ok) return;

  const recipient = hashEmailForLog(mail.input.to);
  console.error(`[email/${mail.kind}] send failed for ${recipient}: ${result.error}`);
  if (!result.retryable) return;

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("mail_retry_queue").insert({
      kind: mail.kind,
      payload: mail.input as unknown as Json,
      last_error: result.error.slice(0, 500),
    });
    if (error) {
      console.error(`[email/retry-queue] ${mail.kind} for ${recipient} not queued: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[email/retry-queue] ${mail.kind} for ${recipient} not queued: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
