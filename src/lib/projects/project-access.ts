import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Ablauf des Portal-Zugangs pro Projekt (PROJ-6, QA 2026-11-21, BUG-G6).
//
// Vorher prüfte nur die Middleware, ob ALLE Projekte eines Kontos abgelaufen
// sind. Wer noch ein aktives Projekt hatte, konnte in einem abgelaufenen
// weiterarbeiten. Jetzt:
//   - Die Middleware sperrt die Seiten des abgelaufenen Projekts.
//   - Jede Server Action, die Inhalte ändert, prüft den Ablauf selbst —
//     Server Actions lassen sich auch über eine andere Seite aufrufen.
//
// Lesen, Verlassen, Löschen und Mitglieder entfernen bleiben erlaubt.

export const PROJECT_EXPIRED_ERROR =
  "Ihr Portal-Zugang für dieses Projekt ist abgelaufen. Bitte verlängern Sie ihn, um weiterzuarbeiten.";

const ACCESS_CHECK_FAILED_ERROR =
  "Ihr Portal-Zugang konnte gerade nicht geprüft werden. Bitte versuchen Sie es erneut.";

const PROJECT_PATH =
  /^\/projektuebersicht\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/** `null` = kein Ablaufdatum hinterlegt, das zählt nicht als abgelaufen. */
export function isAccessExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < now;
}

/** Projekt-ID aus einem Pfad wie `/projektuebersicht/<id>/kapiteleditor/…`. */
export function projectIdFromPath(pathname: string): string | null {
  return PROJECT_PATH.exec(pathname)?.[1] ?? null;
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
