"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COVER_COLORS, DEFAULT_COLOR_ID } from "@/lib/cover-colors";
import { COVER_THEMES, DEFAULT_THEME_ID } from "@/lib/cover-themes";
import { COVER_SCHEMA_VERSION } from "@/lib/cover-types";

// Zod v4 uuid() rejects valid-format seed UUIDs. Wir validieren nur das
// Shape; RLS auf project_covers + project_members ist die Authority.
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");

const titleSchema = z
  .string()
  .max(60, "Titel darf maximal 60 Zeichen haben.")
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Titel darf nicht leer sein."));

const subtitleSchema = z
  .string()
  .max(80, "Untertitel darf maximal 80 Zeichen haben.")
  .transform((s) => s.replace(/[\r\n]+/g, " ").trim())
  .pipe(z.string());

const authorSchema = z
  .string()
  .max(80, "Autor-Zeile darf maximal 80 Zeichen haben.")
  .transform((s) => s.replace(/[\r\n]+/g, " ").trim())
  .pipe(z.string());

const themeIdSchema = z
  .string()
  .refine((v) => COVER_THEMES.some((t) => t.id === v), "Unbekanntes Muster.");

const colorIdSchema = z
  .string()
  .refine((v) => COVER_COLORS.some((c) => c.id === v), "Unbekannte Farbe.");

// Storage-Pfad-Schema: <project_id>/cover-<timestamp>.<ext>
// Erlaubte Extensions: jpg, jpeg, png, webp (HEIC kommt nicht durch — siehe Spec).
const STORAGE_PATH_RE =
  /^[0-9a-fA-F-]{36}\/cover-[0-9]+\.(?:jpg|jpeg|png|webp)$/i;
const imagePathSchema = z
  .string()
  .regex(STORAGE_PATH_RE, "Ungültiger Bild-Pfad.")
  .nullable();

const saveCoverSchema = z.object({
  projectId: uuidSchema,
  title: titleSchema,
  subtitle: subtitleSchema,
  authorLine: authorSchema,
  themeId: themeIdSchema,
  colorId: colorIdSchema,
  imagePath: imagePathSchema,
});

export type SaveCoverInput = z.input<typeof saveCoverSchema>;

/**
 * Schreibt den aktuellen Cover-Stand ins Backend.
 *
 * Auth: User muss Mitglied des Projekts sein. Wir verifizieren das
 * defense-in-depth zusätzlich zu RLS.
 *
 * - Titel landet IMMER in `projects.title` (Single Source of Truth).
 * - subtitle, author_line, background_color landen in metadata-JSONB.
 * - theme und image_url sind eigene Spalten in project_covers.
 *
 * UPSERT auf project_covers (project_id ist UNIQUE). Wenn noch keine
 * Zeile existiert, wird sie angelegt — Default-Cover bleibt sonst
 * ohne DB-Row erhalten.
 */
export async function saveCoverAction(
  input: SaveCoverInput,
): Promise<{ updatedAt?: string; error?: string }> {
  const parsed = saveCoverSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { projectId, title, subtitle, authorLine, themeId, colorId, imagePath } =
    parsed.data;

  // Path-Prefix-Check: imagePath muss mit `${projectId}/` beginnen, wenn
  // gesetzt. Verhindert, dass ein Mitglied zweier Projekte den Foto-Pfad
  // von B in der Cover-Row von A speichert (Daten-Integrität / Footgun).
  // RLS auf Storage verbietet Cross-Projekt-Lesen ohnehin — aber wir
  // wollen die kaputten Verweise gar nicht erst zulassen.
  if (imagePath !== null && !imagePath.startsWith(`${projectId}/`)) {
    return { error: "Pfad gehört nicht zum Projekt." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Mitgliedschaft prüfen (defense-in-depth zu RLS)
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!membership) return { error: "Projekt nicht gefunden." };

  // 1. Titel in projects.title — nur updaten, wenn er sich geändert hat.
  //    (UPDATE-Trigger bumpt projects.updated_at, was die Startseiten-
  //    Sortierung beeinflusst — wir wollen Cover-Edits nicht den Titel
  //    bumpen, wenn er identisch bleibt.)
  const { data: currentProject } = await supabase
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .single();
  if (currentProject && currentProject.title !== title) {
    const { error: titleErr } = await supabase
      .from("projects")
      .update({ title })
      .eq("id", projectId);
    if (titleErr) {
      return { error: "Titel konnte nicht gespeichert werden." };
    }
  }

  // 2. Cover-Zeile UPSERTen. project_id ist UNIQUE — onConflict-Strategie.
  const metadata = {
    subtitle: subtitle || "",
    author_line: authorLine || "",
    background_color: colorId || DEFAULT_COLOR_ID,
    schema_version: COVER_SCHEMA_VERSION,
  };

  const { data: row, error: upsertErr } = await supabase
    .from("project_covers")
    .upsert(
      {
        project_id: projectId,
        image_url: imagePath, // Storage-Pfad, NICHT signed URL
        theme: themeId || DEFAULT_THEME_ID,
        metadata,
      },
      { onConflict: "project_id" },
    )
    .select("updated_at")
    .single();

  if (upsertErr) {
    return { error: "Cover konnte nicht gespeichert werden." };
  }

  revalidatePath(`/projektuebersicht/${projectId}`);
  revalidatePath(`/projektuebersicht/${projectId}/cover-bearbeiten`);
  revalidatePath("/");

  return { updatedAt: row.updated_at };
}

// ─── Signed URL für Foto-Vorschau im Editor ──────────────────────────────────

const signedUrlSchema = z.object({
  projectId: uuidSchema,
  imagePath: z.string().regex(STORAGE_PATH_RE, "Ungültiger Bild-Pfad."),
});

/**
 * Erzeugt eine signed URL (1 h Gültigkeit) für den angegebenen Cover-
 * Foto-Pfad. Wird vom Client direkt nach einem erfolgreichen Upload
 * gerufen, damit die Live-Vorschau das Foto sofort zeigt — ohne Page-Reload.
 *
 * Auth: User muss Mitglied des Projekts sein.
 */
export async function getCoverImageSignedUrlAction(input: {
  projectId: string;
  imagePath: string;
}): Promise<{ signedUrl?: string; error?: string }> {
  const parsed = signedUrlSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { projectId, imagePath } = parsed.data;

  // Pfad-Prefix muss zur projectId passen — verhindert, dass jemand mit
  // einer fremden Projekt-ID + manipuliertem Pfad eine signed URL für
  // ein anderes Projekt abruft.
  if (!imagePath.startsWith(`${projectId}/`)) {
    return { error: "Pfad gehört nicht zum Projekt." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!membership) return { error: "Projekt nicht gefunden." };

  const { data, error } = await supabase.storage
    .from("project-covers")
    .createSignedUrl(imagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return { error: "Vorschau-URL konnte nicht erzeugt werden." };
  }

  return { signedUrl: data.signedUrl };
}
