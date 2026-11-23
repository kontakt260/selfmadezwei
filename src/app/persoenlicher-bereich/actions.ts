"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { redirect } from "next/navigation";
import {
  loadAccountDeletionOverview,
  prepareAccountDeletion,
  type AccountDeletionOverview,
} from "@/lib/account/account-deletion";
import { sendInBackground } from "@/lib/email/background";
import { removeQueuedMailsOfAccount } from "@/lib/email/retry-queue";
import { notifyProjectHandover } from "@/lib/email/send-project-handover";
import { processStorageCleanup } from "@/lib/projects/storage-cleanup";
import { CAPTCHA_FAILED_MESSAGE, captchaTokenFrom, isCaptchaError } from "@/lib/captcha";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGES,
  hitRateLimits,
  undoRateLimits,
} from "@/lib/rate-limit";

// ─── Update Name ────────────────────────────────────────────────────────────

const nameSchema = z.object({
  name: z
    .string()
    .min(2, "Name muss mindestens 2 Zeichen haben.")
    .max(100, "Name darf maximal 100 Zeichen haben."),
});

export type UpdateNameState = { success?: boolean; error?: string; fullName?: string };

export async function updateNameAction(
  _prev: UpdateNameState,
  formData: FormData,
): Promise<UpdateNameState> {
  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const fullName = parsed.data.name.trim();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) return { error: "Name konnte nicht gespeichert werden." };
  return { success: true, fullName };
}

// ─── Reset Password ──────────────────────────────────────────────────────────

export type ResetPasswordState = { success?: boolean; error?: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Nicht angemeldet." };

  const accountCheck = { rule: RATE_LIMITS.accountReset, identifier: user.id };
  const limit = await hitRateLimits([accountCheck]);
  if (limit.unavailable) return { error: RATE_LIMIT_MESSAGES.unavailable };
  if (!limit.allowed) {
    return { error: "Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut." };
  }

  const origin = getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${origin}/auth/callback?next=/passwort-zuruecksetzen`,
    captchaToken: captchaTokenFrom(formData),
  });

  if (isCaptchaError(error)) {
    // Eine fehlgeschlagene Prüfung kostet keinen der drei Versuche.
    await undoRateLimits([accountCheck]);
    return { error: CAPTCHA_FAILED_MESSAGE };
  }
  if (error) return { error: "Zurücksetzen fehlgeschlagen. Bitte versuchen Sie es erneut." };
  return { success: true };
}

// ─── Delete Account ──────────────────────────────────────────────────────────

export type DeleteAccountState = {
  error?: string;
  /** Die Übersicht im Dialog ist veraltet und muss neu geladen werden. */
  overviewChanged?: boolean;
};

export type AccountDeletionOverviewState = {
  overview?: AccountDeletionOverview;
  /** Steht im Dialog als erster Punkt unter „Wird gelöscht". */
  account?: { fullName: string; email: string };
  error?: string;
};

const DELETE_NOT_CONFIGURED =
  "Die Konto-Löschung ist serverseitig nicht konfiguriert. Bitte wenden Sie sich an den Support.";
const DELETE_FAILED =
  "Das Konto konnte nicht gelöscht werden. Bitte versuchen Sie es erneut oder wenden Sie sich an den Support.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE);

const deleteAccountSchema = z.object({
  confirmation: z.literal("LÖSCHEN"),
  confirmedDelete: z.array(uuidSchema).max(500),
  successors: z.record(uuidSchema, uuidSchema),
});

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Zeigt vor dem Löschen, was mit den Projekten des Kontos passiert. */
export async function getAccountDeletionOverviewAction(): Promise<AccountDeletionOverviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  try {
    const adminClient = createServiceRoleClient();
    const overview = await loadAccountDeletionOverview(adminClient, user);
    if (overview) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        overview,
        account: { fullName: profile?.full_name ?? "", email: user.email ?? "" },
      };
    }
  } catch (err) {
    console.error("[getAccountDeletionOverviewAction] failed:", err);
  }
  return { error: "Die Übersicht konnte nicht geladen werden. Bitte versuchen Sie es erneut." };
}

export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const parsed = deleteAccountSchema.safeParse({
    confirmation: formData.get("confirmation"),
    confirmedDelete: parseJsonField(formData.get("confirmedDelete")),
    successors: parseJsonField(formData.get("successors")),
  });
  if (!parsed.success) {
    return { error: "Bitte bestätigen Sie die Löschung erneut.", overviewChanged: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  let adminClient: ReturnType<typeof createServiceRoleClient>;
  try {
    adminClient = createServiceRoleClient();
  } catch (err) {
    console.error("[deleteAccountAction] service role client unavailable:", err);
    return { error: DELETE_NOT_CONFIGURED };
  }

  // Der Name verschwindet gleich mit dem Profil, die Warteschlange braucht ihn.
  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  // 1) In einer Transaktion: Nachfolge, Eigentum, Einzelprojekte, Kaufdaten.
  const prepared = await prepareAccountDeletion(adminClient, {
    userId: user.id,
    email: user.email,
    confirmedDelete: parsed.data.confirmedDelete,
    successors: parsed.data.successors,
  });
  if (prepared.status === "changed") {
    return {
      error: "In Ihren Projekten hat sich etwas geändert. Bitte prüfen Sie die Übersicht erneut.",
      overviewChanged: true,
    };
  }
  if (prepared.status === "failed") return { error: DELETE_FAILED };

  // Beides gilt ab jetzt, auch falls der nächste Schritt scheitert.
  prepared.handovers.forEach(notifyProjectHandover);
  if (prepared.deletedProjectIds.length > 0) {
    sendInBackground("storage_cleanup", () => processStorageCleanup(prepared.deletedProjectIds));
  }

  // 2) Konto löschen. Profil und Mitgliedschaften verschwinden per CASCADE in
  //    einem Schritt, payments und purchase_claims verlieren den Personenbezug.
  const { error: authError } = await adminClient.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("[deleteAccountAction] auth delete failed:", authError);
    return { error: DELETE_FAILED, overviewChanged: true };
  }

  // Noch nicht verschickte Mails an diese Person entfallen, ihr Name
  // verschwindet aus Mails an andere (BUG-20).
  await removeQueuedMailsOfAccount({ email: user.email, fullName: profile?.full_name });

  // Die Session-Cookies gehören zu einem Konto, das es nicht mehr gibt.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("[deleteAccountAction] local sign-out failed:", err);
  }

  redirect("/anmelden");
}
