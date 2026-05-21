"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ─── Schemas ─────────────────────────────────────────────────────────────────

// Zod v4 uuid() enforces RFC 4122 version/variant nibbles and rejects valid-format
// seed UUIDs (e.g. cccccccc-0099-0099-0099-000000000099). Real security is enforced
// by Supabase RLS; we just validate the shape to reject garbage strings.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");

const chapterTitleSchema = z
  .string()
  .min(1, "Titel darf nicht leer sein.")
  .max(200, "Titel darf maximal 200 Zeichen haben.")
  .transform((s) => s.trim());

// ─── Delete Project ───────────────────────────────────────────────────────────

export async function deleteProjectAction(
  projectId: string,
): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(projectId).success) return { error: "Ungültige Projekt-ID." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Defense-in-depth: verify projektleiter role before deleting
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return { error: "Projekt nicht gefunden." };
  if (membership.role !== "projektleiter") return { error: "Keine Berechtigung zum Löschen." };

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: "Projekt konnte nicht gelöscht werden." };

  // Markiert User als „hatte schonmal ein Projekt" — Onboarding zeigt
  // basierend darauf den Konto-Löschen-Link, falls keine aktiven Projekte
  // mehr existieren. Fehler hier ignorieren, der Projekt-Delete ist wichtiger.
  await supabase.auth.updateUser({ data: { had_project: true } });

  revalidatePath("/");
  return {};
}

// ─── Add Chapter (own) ────────────────────────────────────────────────────────

const addChapterSchema = z.object({
  title: chapterTitleSchema,
  projectId: uuidSchema,
});

export async function addChapterAction(
  formData: FormData,
): Promise<{ chapterId?: string; error?: string }> {
  const parsed = addChapterSchema.safeParse({
    title: formData.get("title"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { title, projectId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Get current max sort_order for this project (RLS enforces membership)
  const { data: lastChapter } = await supabase
    .from("chapters")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (lastChapter?.sort_order ?? -1) + 1;

  const { data: newChapter, error } = await supabase
    .from("chapters")
    .insert({
      title,
      project_id: projectId,
      sort_order: nextSortOrder,
      chapter_origin: "custom",
      body: null,
    })
    .select("id")
    .single();

  if (error || !newChapter) return { error: "Kapitel konnte nicht angelegt werden." };

  // Touch the project's updated_at so home page sort order is correct
  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projektuebersicht/${projectId}`);
  return { chapterId: newChapter.id };
}

// ─── Add Chapter (Erzähl-Impuls) ─────────────────────────────────────────────

export async function addImpulseChapterAction(
  formData: FormData,
): Promise<{ chapterId?: string; error?: string }> {
  const parsed = addChapterSchema.safeParse({
    title: formData.get("title"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { title, projectId } = parsed.data;

  // PROJ-8: optionaler impulseId-Parameter. UUID-Format wird validiert;
  // Lookup in impulse_catalog stellt sicher, dass der Impuls existiert
  // (FK-Check würde das auch beim INSERT abfangen, aber wir wollen
  // einen klaren UI-Fehler liefern, nicht 23503).
  const rawImpulseId = formData.get("impulseId");
  let impulseId: string | null = null;
  if (typeof rawImpulseId === "string" && rawImpulseId.length > 0) {
    const idCheck = uuidSchema.safeParse(rawImpulseId);
    if (!idCheck.success) {
      return { error: "Ungültige Impuls-ID." };
    }
    impulseId = idCheck.data;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Wenn impulseId geliefert wurde, vorab existieren prüfen — sonst
  // landet später ein FK-Fehler aus chapters_source_impulse_id_fkey.
  if (impulseId) {
    const { data: impulseRow } = await supabase
      .from("impulse_catalog")
      .select("id")
      .eq("id", impulseId)
      .maybeSingle();
    if (!impulseRow) {
      return { error: "Erzähl-Impuls nicht gefunden." };
    }
  }

  const { data: lastChapter } = await supabase
    .from("chapters")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (lastChapter?.sort_order ?? -1) + 1;

  const { data: newChapter, error } = await supabase
    .from("chapters")
    .insert({
      title,
      project_id: projectId,
      sort_order: nextSortOrder,
      chapter_origin: "catalog_impulse",
      source_impulse_id: impulseId,
      body: null,
    })
    .select("id")
    .single();

  if (error || !newChapter) return { error: "Kapitel konnte nicht angelegt werden." };

  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projektuebersicht/${projectId}`);
  return { chapterId: newChapter.id };
}

// ─── Rename Chapter ───────────────────────────────────────────────────────────

const renameChapterSchema = z.object({
  chapterId: uuidSchema,
  title: chapterTitleSchema,
  projectId: uuidSchema,
});

export async function renameChapterAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = renameChapterSchema.safeParse({
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { chapterId, title, projectId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // RLS enforces that user is member of the project containing this chapter
  const { error } = await supabase
    .from("chapters")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", chapterId)
    .eq("project_id", projectId);

  if (error) return { error: "Kapitel konnte nicht umbenannt werden." };

  revalidatePath(`/projektuebersicht/${projectId}`);
  return {};
}

// ─── Delete Chapter ───────────────────────────────────────────────────────────

const deleteChapterSchema = z.object({
  chapterId: uuidSchema,
  projectId: uuidSchema,
});

export async function deleteChapterAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = deleteChapterSchema.safeParse({
    chapterId: formData.get("chapterId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { chapterId, projectId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // RLS enforces membership; .eq("project_id") prevents cross-project deletion
  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", chapterId)
    .eq("project_id", projectId);

  if (error) return { error: "Kapitel konnte nicht gelöscht werden." };

  revalidatePath(`/projektuebersicht/${projectId}`);
  return {};
}

// ─── Save Chapter Order ───────────────────────────────────────────────────────

const saveOrderSchema = z.object({
  projectId: uuidSchema,
  orderedIds: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Ungültige Kapitel-IDs." });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.string().uuid()).min(1)),
});

export async function saveChapterOrderAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = saveOrderSchema.safeParse({
    projectId: formData.get("projectId"),
    orderedIds: formData.get("orderedIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { projectId, orderedIds } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Security: load all chapter IDs for this project from DB (RLS enforces membership)
  const { data: dbChapters, error: fetchError } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  if (fetchError) return { error: "Reihenfolge konnte nicht gespeichert werden." };

  const dbIds = new Set((dbChapters ?? []).map((c) => c.id));

  // All submitted IDs must belong to this project, and counts must match
  const allValid =
    orderedIds.length === dbIds.size && orderedIds.every((id) => dbIds.has(id));

  if (!allValid) return { error: "Sicherheitsfehler: Ungültige Kapitel-IDs." };

  // Bulk update sort_order
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("chapters").update({ sort_order: index }).eq("id", id),
    ),
  );

  revalidatePath(`/projektuebersicht/${projectId}`);
  return {};
}
