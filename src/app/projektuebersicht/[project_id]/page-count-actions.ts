"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { bookFontOrDefault, pageCountIsCurrent, type BookFontId } from "@/lib/book-fonts";
import { stripSoftHyphensFromBody } from "@/lib/hyphenation";
import { isAccessExpired } from "@/lib/projects/project-access";
import { parseImageSections, prepareChapterImages } from "@/lib/kapiteleditor/image-sections";
import type { ImageSections } from "@/lib/kapiteleditor/types";

// PROJ-32 Schritt 3: Neusatz im Browser. Nach einem Schriftwechsel stimmen die
// gespeicherten Seitenzahlen nicht mehr. Der Browser setzt die betroffenen
// Kapitel unsichtbar mit demselben Seiten-Takt wie der Editor und speichert nur
// die Seitenzahl (chapterPageCountAction). Diese Aktionen liefern ihm, welche
// Kapitel veraltet sind, und deren Inhalt. Gelesen wird mit den Rechten der
// angemeldeten Person (RLS), nichts wird hier geschrieben.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");

const queueSchema = z.object({ projectId: uuidSchema });
const chapterSchema = z.object({ projectId: uuidSchema, chapterId: uuidSchema });

const LOAD_ERROR = "Die Seitenzahlen konnten gerade nicht geladen werden.";

export type PageCountQueue = {
  bookFont: BookFontId;
  /** Kapitel, deren Seitenzahl mit einer anderen Schrift gemessen wurde, in Buchreihenfolge. */
  chapterIds: string[];
};

/**
 * Welche Kapitel brauchen eine neue Seitenzahl? Im Lesemodus keine: Dort darf
 * nichts gespeichert werden (PROJ-28).
 */
export async function pageCountQueueAction(input: {
  projectId: string;
}): Promise<{ queue?: PageCountQueue; error?: string }> {
  const parsed = queueSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Eingabe." };
  const { projectId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const [project, access, chapters] = await Promise.all([
    supabase.from("projects").select("book_font").eq("id", projectId).maybeSingle(),
    supabase.from("project_access").select("expires_at").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("chapters")
      .select("id, page_count_font")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
  ]);
  if (project.error || access.error || chapters.error) return { error: LOAD_ERROR };
  // RLS: Ohne Mitgliedschaft ist das Projekt unsichtbar.
  if (!project.data) return { error: "Projekt nicht gefunden." };

  const bookFont = bookFontOrDefault(project.data.book_font);
  if (isAccessExpired(access.data?.expires_at)) return { queue: { bookFont, chapterIds: [] } };
  const chapterIds = (chapters.data ?? [])
    .filter((chapter) => !pageCountIsCurrent(chapter.page_count_font, bookFont))
    .map((chapter) => chapter.id);
  return { queue: { bookFont, chapterIds } };
}

export type TypesetChapter = {
  title: string;
  body: unknown;
  imageSections: ImageSections;
  /** Stand beim Laden. Gespeichert wird nur, wenn sich das Kapitel seitdem nicht geändert hat. */
  updatedAt: string;
};

/**
 * Inhalt eines Kapitels für den Neusatz, so aufbereitet wie beim Öffnen im
 * Editor (ohne Trennzeichen, Bildabschnitte im Text). Bildlinks braucht der
 * Neusatz nicht: Die Bildplätze haben feste Seitenverhältnisse.
 */
export async function typesetChapterAction(input: {
  projectId: string;
  chapterId: string;
}): Promise<{ chapter?: TypesetChapter; error?: string }> {
  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Eingabe." };
  const { projectId, chapterId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data, error } = await supabase
    .from("chapters")
    .select("title, body, image_sections, updated_at")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return { error: LOAD_ERROR };
  if (!data) return { error: "Kapitel nicht gefunden." };

  const prepared = prepareChapterImages(
    stripSoftHyphensFromBody(data.body),
    parseImageSections(data.image_sections),
  );
  return {
    chapter: {
      title: data.title,
      body: prepared.body,
      imageSections: prepared.imageSections,
      updatedAt: data.updated_at,
    },
  };
}
