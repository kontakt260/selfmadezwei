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
