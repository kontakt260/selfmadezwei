import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// PROJ-26 — serverseitiger Papierkorb.
//
// Gelöschte Inhalte bleiben 14 Tage auf dem Server. Das Verschieben übernimmt
// die Datenbank selbst, damit auch Löschungen an der App vorbei erfasst werden.
// Kunden sehen davon nichts, Wiederherstellen läuft über den Support
// (docs/production/support-papierkorb.md).

const purgeResultSchema = z.object({
  projects: z.number().int().min(0),
  chapters: z.number().int().min(0),
});

export type TrashPurgeResult = z.infer<typeof purgeResultSchema>;

/** Löscht fällige Inhalte endgültig. Die Dateien entfernt danach die Aufräumliste. */
export async function purgeDueTrash(): Promise<TrashPurgeResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("trash_purge_due");
  if (error) throw new Error(error.message);
  return purgeResultSchema.parse(data);
}

const paidRestoreSchema = z.object({
  status: z.enum([
    "restored",
    "not_in_trash",
    "gone",
    "deleted_by_customer",
    "not_paid",
    "lead_required",
  ]),
});

export type PaidRestoreStatus = z.infer<typeof paidRestoreSchema>["status"];

/**
 * PROJ-28: Eine Zahlung holt ein wegen Ablauf verschobenes Projekt zurück.
 * Von Personen gelöschte Projekte bleiben liegen, das klärt der Support.
 */
export async function restorePaidProject(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<PaidRestoreStatus> {
  const { data, error } = await supabase.rpc("retention_restore_paid", {
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return paidRestoreSchema.parse(data).status;
}

/**
 * PROJ-28: Bis wann eine Schonfrist das Projekt vor dem Löschlauf schützt.
 * Nur nach geprüfter Mitgliedschaft aufrufen, die Tabelle ist für Kunden gesperrt.
 */
export async function getRetentionHoldUntil(projectId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("project_retention_holds")
    .select("hold_until")
    .eq("project_id", projectId)
    .gt("hold_until", new Date().toISOString())
    .order("hold_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[retention] hold lookup failed: ${error.message}`);
    return null;
  }
  return data?.hold_until ?? null;
}

/** Wirft bei einem Datenbankfehler, damit niemand aus Versehen weitermacht. */
export async function isProjectInTrash(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("trash_projects")
    .select("project_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}
