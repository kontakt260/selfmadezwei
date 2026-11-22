import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MailFailureAlertEmail } from "@/emails/MailFailureAlertEmail";
import type { Database } from "@/lib/database.types";
import { isPast } from "@/lib/dates";
import { isProjectInTrash } from "@/lib/projects/trash";
import { generateClaimToken, hashClaimToken } from "@/lib/purchases/claim-token";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail, type SendMailResult } from "./client";
import { deliverGuestPurchaseMail, type SendGuestPurchaseInput } from "./send-guest-purchase";
import { deliverInvitationMail, type SendInvitationInput } from "./send-invitation";
import { deliverPortalPurchaseMail, type SendPortalPurchaseInput } from "./send-portal-purchase";
import {
  deliverProjectHandoverMail,
  type SendProjectHandoverInput,
} from "./send-project-handover";
import {
  deliverRenewalInfoMail,
  deliverRenewalMail,
  type SendRenewalInfoInput,
  type SendRenewalInput,
} from "./send-renewal";

// PROJ-11 BUG-13 — holt gescheiterte Mails nach (täglicher Cron).
//
// Pro Lauf ein Versuch je Mail. Nach dem letzten Versuch bekommt die
// Support-Adresse einen Hinweis ohne personenbezogene Daten. Erst wenn dieser
// Hinweis angekommen ist, gilt die Mail als aufgegeben (BUG-19): Fällt Resend
// länger aus, scheitert auch der Hinweis, und der nächste Lauf versucht beides
// erneut. Aufgegebene Einträge werden nach 30 Tagen gelöscht.

export const MAX_RETRY_ATTEMPTS = 3;
export const GAVE_UP_RETENTION_DAYS = 30;
export const MAIL_ALERT_RECIPIENT = "kontakt@narravit.de";

const MAX_ROWS_PER_RUN = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const KIND_LABELS: Record<string, string> = {
  invitation: "Einladung",
  portal_purchase: "Kaufbestätigung",
  guest_purchase: "Kauf ohne Konto",
  renewal: "Verlängerung",
  renewal_info: "Verlängerungs-Info",
  project_handover: "Neue Projektleitung",
};

type ServiceClient = SupabaseClient<Database>;
type QueueRow = Database["public"]["Tables"]["mail_retry_queue"]["Row"];
type Delivery = { status: "sent" } | { status: "obsolete" } | { status: "failed"; error: string };

export type MailRetryResult = {
  /** Mails, für die dieser Lauf einen Versuch gemacht hat. */
  retried: number;
  sent: number;
  /** Nicht mehr nötig, z. B. Einladung inzwischen angenommen oder widerrufen. */
  dropped: number;
  /** Aufgegeben und dem Support gemeldet. */
  gaveUp: number;
};

function fromResult(result: SendMailResult): Delivery {
  return result.ok ? { status: "sent" } : { status: "failed", error: result.error };
}

async function deliver(supabase: ServiceClient, row: QueueRow): Promise<Delivery> {
  switch (row.kind) {
    case "invitation": {
      const input = row.payload as unknown as SendInvitationInput;
      // Eine widerrufene, angenommene oder abgelaufene Einladung bleibt still.
      const { data, error } = await supabase
        .from("invitations")
        .select("accepted_at, expires_at, project_id")
        .eq("token", input.token)
        .maybeSingle();
      if (error) return { status: "failed", error: error.message };
      if (!data || data.accepted_at || isPast(data.expires_at)) return { status: "obsolete" };
      if (await isProjectInTrash(supabase, data.project_id)) return { status: "obsolete" };
      return fromResult(await deliverInvitationMail(input));
    }
    case "portal_purchase":
      return fromResult(
        await deliverPortalPurchaseMail(row.payload as unknown as SendPortalPurchaseInput),
      );
    case "guest_purchase": {
      const input = row.payload as unknown as SendGuestPurchaseInput;
      // Das ursprüngliche Geheimnis ist nirgends gespeichert: neues erzeugen,
      // nur den Hash ablegen. Ist der Kauf schon eingelöst, entfällt die Mail.
      const claimCode = generateClaimToken();
      const { data, error } = await supabase
        .from("purchase_claims")
        .update({ mail_token_hash: hashClaimToken(claimCode) })
        .eq("stripe_session_id", input.stripeSessionId)
        .is("claimed_at", null)
        .select("id");
      if (error) return { status: "failed", error: error.message };
      if (!data || data.length === 0) return { status: "obsolete" };
      return fromResult(await deliverGuestPurchaseMail({ ...input, claimCode }));
    }
    case "renewal":
      return fromResult(await deliverRenewalMail(row.payload as unknown as SendRenewalInput));
    // PROJ-26: Die Zahlungsbestätigung geht immer raus, diese beiden Hinweise
    // ergeben für ein gelöschtes Projekt keinen Sinn mehr.
    case "renewal_info": {
      const input = row.payload as unknown as SendRenewalInfoInput;
      if (input.projectId && (await isProjectInTrash(supabase, input.projectId))) {
        return { status: "obsolete" };
      }
      return fromResult(await deliverRenewalInfoMail(input));
    }
    case "project_handover": {
      const input = row.payload as unknown as SendProjectHandoverInput;
      if (await isProjectInTrash(supabase, input.projectId)) return { status: "obsolete" };
      return fromResult(await deliverProjectHandoverMail(input));
    }
    default:
      return { status: "failed", error: `unknown mail kind: ${row.kind}` };
  }
}

/** Gibt zurück, ob der Hinweis beim Support angekommen ist. */
async function sendGaveUpAlert(kinds: string[]): Promise<boolean> {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    const label = KIND_LABELS[kind] ?? kind;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const result = await sendEmail({
    to: MAIL_ALERT_RECIPIENT,
    subject: "NARRAVIT: Mails konnten nicht verschickt werden",
    react: MailFailureAlertEmail({
      items: [...counts].map(([label, count]) => ({ label, count })),
      attempts: MAX_RETRY_ATTEMPTS,
      retentionDays: GAVE_UP_RETENTION_DAYS,
    }),
    tags: [{ name: "type", value: "mail_failure_alert" }],
  });
  if (!result.ok) {
    console.error(`[email/retry] alert failed: ${result.error}`);
  }
  return result.ok;
}

/** Ein Durchlauf der Warteschlange. Wirft nicht bei Fehlern einzelner Mails. */
export async function processMailRetryQueue(): Promise<MailRetryResult> {
  const result: MailRetryResult = { retried: 0, sent: 0, dropped: 0, gaveUp: 0 };
  const supabase = createServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("mail_retry_queue")
    .select("*")
    .is("gave_up_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) {
    console.error(`[email/retry] queue read failed: ${error.message}`);
    return result;
  }

  const exhausted: Array<{ id: string; kind: string }> = [];

  for (const row of rows ?? []) {
    const attempt = row.attempts + 1;

    // Versuch vormerken: Laufen zwei Crons parallel, gewinnt nur einer.
    const { data: claimed, error: claimError } = await supabase
      .from("mail_retry_queue")
      .update({ attempts: attempt })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("gave_up_at", null)
      .select("id");
    if (claimError) {
      console.error(`[email/retry] claim of ${row.id} failed: ${claimError.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    result.retried += 1;

    let delivery: Delivery;
    try {
      delivery = await deliver(supabase, row);
    } catch (err) {
      delivery = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }

    if (delivery.status !== "failed") {
      if (delivery.status === "sent") result.sent += 1;
      else result.dropped += 1;
      const { error: deleteError } = await supabase
        .from("mail_retry_queue")
        .delete()
        .eq("id", row.id);
      if (deleteError) {
        console.error(`[email/retry] delete of ${row.id} failed: ${deleteError.message}`);
      }
      continue;
    }

    console.error(`[email/retry] ${row.kind} ${row.id} attempt ${attempt} failed: ${delivery.error}`);
    const { error: updateError } = await supabase
      .from("mail_retry_queue")
      .update({ last_error: delivery.error.slice(0, 500) })
      .eq("id", row.id);
    if (updateError) {
      console.error(`[email/retry] update of ${row.id} failed: ${updateError.message}`);
    }
    if (attempt >= MAX_RETRY_ATTEMPTS) exhausted.push({ id: row.id, kind: row.kind });
  }

  // Aufgegeben wird erst, wenn der Support Bescheid weiß. Sonst bleibt der
  // Eintrag offen, und der nächste Lauf versucht Mail und Hinweis erneut.
  if (exhausted.length > 0 && (await sendGaveUpAlert(exhausted.map((row) => row.kind)))) {
    const { error: gaveUpError } = await supabase
      .from("mail_retry_queue")
      .update({ gave_up_at: new Date().toISOString() })
      .in(
        "id",
        exhausted.map((row) => row.id),
      );
    if (gaveUpError) {
      console.error(`[email/retry] marking as given up failed: ${gaveUpError.message}`);
    } else {
      result.gaveUp = exhausted.length;
    }
  }

  // Personenbezogene Daten nicht länger als nötig aufheben.
  const { error: purgeError } = await supabase
    .from("mail_retry_queue")
    .delete()
    .lt("gave_up_at", new Date(Date.now() - GAVE_UP_RETENTION_DAYS * ONE_DAY_MS).toISOString());
  if (purgeError) {
    console.error(`[email/retry] purge failed: ${purgeError.message}`);
  }

  return result;
}
