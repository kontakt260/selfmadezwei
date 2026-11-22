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
