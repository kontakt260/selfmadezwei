import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// PROJ-11 — mail_log-Idempotenz-Helper.
//
// Welcome-, Invitation- und Reminder-Mails sollen pro Auslöse-Schlüssel
// nur EINMAL verschickt werden. Wir lösen das durch ein UNIQUE-NULLS-NOT-
// DISTINCT-Constraint auf (user_id, project_id, mail_type) und einen
// INSERT-ON-CONFLICT-DO-NOTHING.
//
// Workflow:
//   1. Vor dem Versand:  reserveMailLog() → versucht den Row-Insert.
//      - Erfolg → wir bekommen die Log-Row-ID, der Versand darf starten.
//      - Konflikt → eine andere Sitzung hat schon einen Marker; wir
//        überspringen den Versand komplett.
//   2. Nach dem Versand (Erfolg / Fehler): finalizeMailLog() → UPDATE
//      mit resend_message_id oder error.

export type MailType =
  | "welcome"
  | "invitation"
  | "portal_purchase"
  | "renewal"
  | "reminder_30"
  | "reminder_7";

export type ReserveInput = {
  userId: string | null;
  projectId: string | null;
  mailType: MailType;
};

export type ReserveResult =
  | { reserved: true; logId: string }
  | { reserved: false; reason: "duplicate" | "db_error"; error?: string };

/**
 * Versucht, einen mail_log-Marker anzulegen. Schlägt fehl, wenn
 * (user_id, project_id, mail_type) bereits existiert.
 *
 * Wichtig: Stripe-Mails (portal_purchase, renewal) brauchen
 * KEIN reserve — der Stripe-Webhook ist bereits idempotent (UNIQUE
 * stripe_session_id im payments). Sie stehen nicht im mail_log: Den Versand
 * zeigt das Resend-Dashboard, gescheiterte Mails holt `retry-queue.ts` nach
 * (Entscheidung Jakob, 2026-11-23).
 */
export async function reserveMailLog(
  input: ReserveInput,
): Promise<ReserveResult> {
  const supabase = createServiceRoleClient();

  // Versuch 1: INSERT mit RETURNING. Auf Konflikt-Code 23505 → duplicate.
  const { data, error } = await supabase
    .from("mail_log")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      mail_type: input.mailType,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation → Idempotenz greift, kein Versand.
    if (error.code === "23505") {
      return { reserved: false, reason: "duplicate" };
    }
    return {
      reserved: false,
      reason: "db_error",
      error: error.message,
    };
  }

  return { reserved: true, logId: data.id };
}

/**
 * Markiert einen mail_log-Eintrag mit dem Resend-Result. Welcome- und
 * Reminder-Versand rufen bei Fehlern stattdessen `releaseMailLog`, damit
 * der nächste Auslöser es erneut versucht.
 */
export async function finalizeMailLog(
  logId: string,
  result:
    | { ok: true; resendMessageId: string | null }
    | { ok: false; error: string },
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("mail_log")
    .update({
      resend_message_id: result.ok ? result.resendMessageId : null,
      error: result.ok ? null : result.error,
    })
    .eq("id", logId);
}

/**
 * Gibt einen Marker wieder frei, wenn der Versand fehlgeschlagen ist.
 * Der nächste Auslöser (Welcome: nächster Callback, Reminder: nächster
 * Cron-Lauf) versucht es dann erneut, statt die Mail für immer zu
 * verschlucken.
 */
export async function releaseMailLog(logId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("mail_log").delete().eq("id", logId);
  if (error) {
    console.error(`[email/mail_log] release of ${logId} failed: ${error.message}`);
  }
}

/**
 * Entfernt einen Marker, der vor `sentBefore` gesetzt wurde. Für Reminder:
 * Der Marker vom Vorjahr gehört zu einem früheren Ablaufdatum und darf die
 * Erinnerung für das neue Ablaufdatum nicht blockieren. Gibt zurück, ob ein
 * Marker entfernt wurde.
 *
 * Die eindeutige Kombination (user_id, project_id, mail_type) bleibt die
 * Sperre gegen Doppelversand: Laufen zwei Crons parallel, entfernen beide
 * höchstens den alten Marker, und nur einer bekommt danach die Reservierung.
 */
export async function deleteStaleMailLog(input: {
  userId: string;
  projectId: string;
  mailType: MailType;
  sentBefore: Date;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("mail_log")
    .delete()
    .eq("user_id", input.userId)
    .eq("project_id", input.projectId)
    .eq("mail_type", input.mailType)
    .lt("sent_at", input.sentBefore.toISOString())
    .select("id");
  if (error) {
    console.error(
      `[email/mail_log] stale cleanup failed for ${input.mailType}: ${error.message}`,
    );
    return false;
  }
  return (data ?? []).length > 0;
}

/** Ab diesem Alter läuft kein Versand mehr, der zu einem offenen Marker gehört. */
const ABANDONED_MARKER_MS = 60 * 60 * 1000;

/**
 * Entfernt einen Marker, dessen Versand nie zu Ende kam (BUG-18): Die Funktion
 * wurde nach der Reservierung beendet, es gibt weder Resend-ID noch Fehler.
 * Ohne das bliebe die Erinnerung oder Willkommens-Mail für immer aus. Gibt
 * zurück, ob ein Marker entfernt wurde.
 */
export async function deleteAbandonedMailLog(input: {
  userId: string;
  projectId: string | null;
  mailType: MailType;
  now?: number;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date((input.now ?? Date.now()) - ABANDONED_MARKER_MS).toISOString();
  const base = supabase
    .from("mail_log")
    .delete()
    .eq("user_id", input.userId)
    .eq("mail_type", input.mailType)
    .is("resend_message_id", null)
    .is("error", null)
    .lt("sent_at", cutoff);
  const scoped =
    input.projectId === null ? base.is("project_id", null) : base.eq("project_id", input.projectId);
  const { data, error } = await scoped.select("id");
  if (error) {
    console.error(
      `[email/mail_log] abandoned cleanup failed for ${input.mailType}: ${error.message}`,
    );
    return false;
  }
  return (data ?? []).length > 0;
}
