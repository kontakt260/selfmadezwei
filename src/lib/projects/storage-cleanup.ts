import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// PROJ-3 — entfernt die Dateien gelöschter Projekte aus dem Speicher.
//
// Der Speicher gehört nicht zur Datenbank-Transaktion. Deshalb merkt sich die
// Löschung das Projekt in `storage_cleanup_queue`. Direkt danach läuft ein
// erster Versuch, der tägliche Cron wiederholt alles, was offen geblieben ist.
// Alle Dateien eines Projekts liegen unter `{project_id}/`.

export const PROJECT_BUCKETS = [
  "project-logos",
  "chapter-heroes",
  "project-covers",
  "exports",
] as const;

const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
const MAX_FOLDER_DEPTH = 3;
const MAX_ROWS_PER_RUN = 25;

type ServiceClient = SupabaseClient<Database>;

export type StorageCleanupResult = {
  processed: number;
  cleaned: number;
  failed: number;
};

async function listFiles(
  supabase: ServiceClient,
  bucket: string,
  folder: string,
  depth = 0,
): Promise<string[]> {
  const files: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);

    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${folder}/${entry.name}`;
      // Ordner haben im Storage keine ID.
      if (entry.id) {
        files.push(path);
      } else if (depth < MAX_FOLDER_DEPTH) {
        files.push(...(await listFiles(supabase, bucket, path, depth + 1)));
      } else {
        throw new Error(`${bucket}: folder too deep`);
      }
    }

    if (entries.length < LIST_PAGE_SIZE) return files;
  }
}

async function removeProjectFiles(supabase: ServiceClient, projectId: string): Promise<void> {
  for (const bucket of PROJECT_BUCKETS) {
    const files = await listFiles(supabase, bucket, projectId);
    for (let start = 0; start < files.length; start += REMOVE_BATCH_SIZE) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(files.slice(start, start + REMOVE_BATCH_SIZE));
      if (error) throw new Error(`${bucket}: ${error.message}`);
    }
  }
}

/**
 * Arbeitet die Liste ab, auf Wunsch nur für bestimmte Projekte. Wirft nicht bei
 * Fehlern einzelner Projekte, sie bleiben für den nächsten Lauf stehen.
 */
export async function processStorageCleanup(
  projectIds?: string[],
): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  if (projectIds && projectIds.length === 0) return result;

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("storage_cleanup_queue")
    .select("project_id, attempts")
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (projectIds) query = query.in("project_id", projectIds);

  const { data: rows, error } = await query;
  if (error) {
    console.error(`[storage-cleanup] queue read failed: ${error.message}`);
    return result;
  }

  for (const row of rows ?? []) {
    result.processed += 1;

    try {
      // Sicherheitsnetz: Die Dateien eines bestehenden Projekts bleiben immer.
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", row.project_id)
        .maybeSingle();
      if (projectError) throw new Error(projectError.message);

      if (project) {
        console.error(`[storage-cleanup] project ${row.project_id} still exists, skipped`);
      } else {
        await removeProjectFiles(supabase, row.project_id);
        result.cleaned += 1;
      }

      const { error: deleteError } = await supabase
        .from("storage_cleanup_queue")
        .delete()
        .eq("project_id", row.project_id);
      if (deleteError) throw new Error(deleteError.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      console.error(`[storage-cleanup] project ${row.project_id} failed: ${message}`);

      const { error: updateError } = await supabase
        .from("storage_cleanup_queue")
        .update({ attempts: row.attempts + 1, last_error: message.slice(0, 500) })
        .eq("project_id", row.project_id);
      if (updateError) {
        console.error(`[storage-cleanup] update of ${row.project_id} failed: ${updateError.message}`);
      }
    }
  }

  return result;
}
