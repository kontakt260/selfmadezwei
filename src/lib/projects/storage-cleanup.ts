import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  allImages,
  isInChapterFolder,
  parseImageSections,
} from "@/lib/kapiteleditor/image-sections";
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
const MAX_CHAPTER_ROWS_PER_RUN = 100;
const MAX_IMAGE_ROWS_PER_RUN = 300;
const IMAGE_BATCH_SIZE = 25;
const CHAPTER_BUCKET = "chapter-heroes";

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

async function removeFolder(
  supabase: ServiceClient,
  bucket: string,
  folder: string,
): Promise<void> {
  const files = await listFiles(supabase, bucket, folder);
  for (let start = 0; start < files.length; start += REMOVE_BATCH_SIZE) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(files.slice(start, start + REMOVE_BATCH_SIZE));
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
}

async function removeProjectFiles(supabase: ServiceClient, projectId: string): Promise<void> {
  for (const bucket of PROJECT_BUCKETS) {
    await removeFolder(supabase, bucket, projectId);
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

/**
 * PROJ-26 — entfernt die Bilder endgültig gelöschter Kapitel. Sie liegen unter
 * `{project_id}/{chapter_id}/`. Fehlgeschlagene Einträge bleiben stehen.
 */
export async function processChapterStorageCleanup(): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  const supabase = createServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("storage_chapter_cleanup_queue")
    .select("chapter_id, project_id, attempts")
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_CHAPTER_ROWS_PER_RUN);
  if (error) {
    console.error(`[storage-cleanup] chapter queue read failed: ${error.message}`);
    return result;
  }

  for (const row of rows ?? []) {
    result.processed += 1;

    try {
      // Sicherheitsnetz: Bilder eines Kapitels, das noch existiert oder noch
      // wiederhergestellt werden kann, bleiben immer.
      const [live, trashed] = await Promise.all([
        supabase.from("chapters").select("id").eq("id", row.chapter_id).maybeSingle(),
        supabase
          .from("trash_chapters")
          .select("chapter_id")
          .eq("chapter_id", row.chapter_id)
          .maybeSingle(),
      ]);
      if (live.error) throw new Error(live.error.message);
      if (trashed.error) throw new Error(trashed.error.message);

      if (live.data || trashed.data) {
        console.error(`[storage-cleanup] chapter ${row.chapter_id} still exists, skipped`);
      } else {
        await removeFolder(supabase, CHAPTER_BUCKET, `${row.project_id}/${row.chapter_id}`);
        result.cleaned += 1;
      }

      const { error: deleteError } = await supabase
        .from("storage_chapter_cleanup_queue")
        .delete()
        .eq("chapter_id", row.chapter_id);
      if (deleteError) throw new Error(deleteError.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      console.error(`[storage-cleanup] chapter ${row.chapter_id} failed: ${message}`);

      const { error: updateError } = await supabase
        .from("storage_chapter_cleanup_queue")
        .update({ attempts: row.attempts + 1, last_error: message.slice(0, 500) })
        .eq("chapter_id", row.chapter_id);
      if (updateError) {
        console.error(
          `[storage-cleanup] update of chapter ${row.chapter_id} failed: ${updateError.message}`,
        );
      }
    }
  }

  return result;
}

function inBatches<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += IMAGE_BATCH_SIZE) {
    batches.push(items.slice(start, start + IMAGE_BATCH_SIZE));
  }
  return batches;
}

/** Alle Dateien, die ein gespeichertes oder wiederherstellbares Kapitel verwendet. */
async function loadUsedImagePaths(
  supabase: ServiceClient,
  chapterIds: string[],
): Promise<Set<string>> {
  const used = new Set<string>();
  for (const ids of inBatches(chapterIds)) {
    const [live, trashed] = await Promise.all([
      supabase.from("chapters").select("image_sections").in("id", ids).limit(ids.length),
      supabase
        .from("trash_chapters")
        .select("image_sections:snapshot->image_sections")
        .in("chapter_id", ids)
        .limit(ids.length),
    ]);
    if (live.error) throw new Error(live.error.message);
    if (trashed.error) throw new Error(trashed.error.message);
    for (const row of [...(live.data ?? []), ...(trashed.data ?? [])]) {
      for (const image of allImages(parseImageSections(row.image_sections))) {
        used.add(image.storage_path);
      }
    }
  }
  return used;
}

/**
 * PROJ-34 — löscht entfernte Fotos, sobald ihre 14 Tage um sind. Vorher wird
 * noch einmal geprüft, dass weder das Kapitel noch sein Papierkorb-Eintrag die
 * Datei verwendet. Kann das nicht geprüft werden, wird nichts gelöscht.
 */
export async function processImageStorageCleanup(): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  const supabase = createServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("storage_image_cleanup_queue")
    .select("storage_path, chapter_id, project_id, attempts")
    .lte("delete_after", new Date().toISOString())
    .order("attempts", { ascending: true })
    .order("delete_after", { ascending: true })
    .limit(MAX_IMAGE_ROWS_PER_RUN);
  if (error) {
    console.error(`[storage-cleanup] image queue read failed: ${error.message}`);
    return result;
  }
  if (!rows || rows.length === 0) return result;

  let used: Set<string>;
  try {
    used = await loadUsedImagePaths(supabase, [...new Set(rows.map((row) => row.chapter_id))]);
  } catch (err) {
    console.error(
      `[storage-cleanup] image check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  result.processed = rows.length;
  const keptPaths: string[] = [];
  const due: typeof rows = [];
  for (const row of rows) {
    if (used.has(row.storage_path)) {
      keptPaths.push(row.storage_path);
    } else if (!isInChapterFolder(row.storage_path, row.project_id, row.chapter_id)) {
      console.error(`[storage-cleanup] image outside chapter ${row.chapter_id} skipped`);
      keptPaths.push(row.storage_path);
    } else {
      due.push(row);
    }
  }

  // Die Datei bleibt, nur der Eintrag verschwindet.
  for (const paths of inBatches(keptPaths)) {
    const { error: clearError } = await supabase
      .from("storage_image_cleanup_queue")
      .delete()
      .in("storage_path", paths);
    if (clearError) {
      console.error(`[storage-cleanup] image queue clear failed: ${clearError.message}`);
    }
  }

  for (const batch of inBatches(due)) {
    const paths = batch.map((row) => row.storage_path);
    try {
      const { error: removeError } = await supabase.storage.from(CHAPTER_BUCKET).remove(paths);
      if (removeError) throw new Error(removeError.message);
      const { error: clearError } = await supabase
        .from("storage_image_cleanup_queue")
        .delete()
        .in("storage_path", paths);
      if (clearError) throw new Error(clearError.message);
      result.cleaned += batch.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed += batch.length;
      console.error(`[storage-cleanup] image batch failed: ${message}`);
      for (const row of batch) {
        const { error: updateError } = await supabase
          .from("storage_image_cleanup_queue")
          .update({ attempts: row.attempts + 1, last_error: message.slice(0, 500) })
          .eq("storage_path", row.storage_path);
        if (updateError) {
          console.error(`[storage-cleanup] image queue update failed: ${updateError.message}`);
        }
      }
    }
  }

  return result;
}
