import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Ablauf des Projektzugangs pro Projekt (PROJ-6, QA 2026-11-21, BUG-G6).
//
// Seit PROJ-28 bleibt ein abgelaufenes Projekt sichtbar:
//   - Die Screens zeigen es im Lesemodus, verändernde Buttons sind ausgegraut.
//   - Jede Server Action, die Inhalte ändert, prüft den Ablauf selbst —
//     Server Actions lassen sich auch über eine andere Seite aufrufen.
//   - Die Datenbank sperrt das Schreiben zusätzlich (PROJ-6 G6).
//
// Lesen, Verlängern, Verlassen, das ganze Projekt löschen und Mitglieder
// entfernen bleiben erlaubt.

/** So lange bleibt ein Projekt nach dem Ablauf bestehen (Mails, Zugangsfeld). */
export const CONTENT_RETENTION_DAYS = 90;

export const PROJECT_EXPIRED_ERROR =
  "Ihr Projektzugang ist abgelaufen. Bitte verlängern Sie ihn, um weiterzuarbeiten.";

const ACCESS_CHECK_FAILED_ERROR =
  "Ihr Projektzugang konnte gerade nicht geprüft werden. Bitte versuchen Sie es erneut.";

/** `null` = kein Ablaufdatum hinterlegt, das zählt nicht als abgelaufen. */
export function isAccessExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < now;
}

/**
 * PROJ-28: Zeigt ein Screen das Projekt nur zum Ansehen? Lässt sich der Zugang
 * gerade nicht prüfen, bleibt der Screen gesperrt, damit nichts verloren geht.
 */
export function accessResultIsReadOnly(result: {
  data: { expires_at: string | null } | null;
  error: unknown;
}): boolean {
  return result.error ? true : isAccessExpired(result.data?.expires_at);
}

export async function isProjectReadOnly(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<boolean> {
  const result = await supabase
    .from("project_access")
    .select("expires_at")
    .eq("project_id", projectId)
    .maybeSingle();
  return accessResultIsReadOnly(result);
}

/**
 * Fehlertext, wenn das Projekt nicht bearbeitet werden darf, sonst `null`.
 * Bei einem Datenbankfehler wird nicht geschrieben.
 */
export async function projectWriteBlockedError(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_access")
    .select("expires_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return ACCESS_CHECK_FAILED_ERROR;
  return isAccessExpired(data?.expires_at) ? PROJECT_EXPIRED_ERROR : null;
}
