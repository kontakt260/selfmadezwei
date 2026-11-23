"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { countWordsFromBody } from "@/lib/kapiteleditor/countWords";
import { projectWriteBlockedError } from "@/lib/projects/project-access";
import type { ImageSections, ChapterImage } from "@/lib/kapiteleditor/types";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");

const layoutSchema = z.enum(["1-spaltig", "2-spaltig"]);

const chapterImageSchema: z.ZodType<ChapterImage> = z.object({
  id: z.string().min(1).max(120),
  storage_path: z.string().min(1).max(500),
  // signed_url ist server-erzeugt; wir verwerfen den Client-Wert beim Speichern.
  signed_url: z.string().max(2000).optional().default(""),
  alt: z.string().max(500).default(""),
});

const imageSectionSchema = z.object({
  layout: layoutSchema,
  images: z.array(chapterImageSchema).max(60),
});

const imageSectionsSchema = z.object({
  start: imageSectionSchema,
  end: imageSectionSchema,
});

const autosaveSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  title: z.string().min(1, "Titel darf nicht leer sein.").max(200),
  body: z.unknown().optional(),
  imageSections: imageSectionsSchema,
  colorPageCount: z.number().int().min(0).max(10000),
  // PROJ-7: lokale A5-Seitenzahl dieses Kapitels (von der Pagination-
  // Engine beim Settle gemeldet). Optional — alte Clients senden noch
  // keinen Wert; der Server lässt page_count dann unverändert (kein
  // Reset auf 1). Range matched chapters_page_count_range-CHECK.
  pageCount: z.number().int().min(1).max(999).optional(),
});

const pageCountSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  pageCount: z.number().int().min(1).max(999),
});

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const prepareUploadSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: z.enum(["start", "end"]),
  contentType: z.string().max(100),
  size: z.number().int().min(1).max(MAX_FILE_BYTES, "Datei zu groß. Maximum 10 MB."),
});

const commitUploadSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: z.enum(["start", "end"]),
  imageId: uuidSchema,
  storagePath: z.string().max(200),
});

const deleteSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: z.enum(["start", "end"]),
  imageId: z.string().min(1).max(120),
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Save
// ─────────────────────────────────────────────────────────────────────────────

export async function chapterAutosaveAction(input: {
  projectId: string;
  chapterId: string;
  title: string;
  body: unknown;
  imageSections: ImageSections;
  colorPageCount: number;
  pageCount?: number;
}): Promise<{ ok?: true; error?: string }> {
  const parsed = autosaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, title, body, imageSections, colorPageCount, pageCount } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const accessError = await projectWriteBlockedError(supabase, projectId);
  if (accessError) return { error: accessError };

  // Strip signed_url before persisting (server-erzeugt zur Laufzeit).
  const stripped: ImageSections = {
    start: {
      layout: imageSections.start.layout,
      images: imageSections.start.images.map((i) => ({
        id: i.id,
        storage_path: i.storage_path,
        signed_url: "",
        alt: i.alt ?? "",
      })),
    },
    end: {
      layout: imageSections.end.layout,
      images: imageSections.end.images.map((i) => ({
        id: i.id,
        storage_path: i.storage_path,
        signed_url: "",
        alt: i.alt ?? "",
      })),
    },
  };

  // RLS sorgt für Membership-Check; .eq("project_id") für Defense-in-depth.
  // PROJ-7: page_count nur ins UPDATE-Set aufnehmen, wenn der Client einen
  // Wert geliefert hat — sonst bleibt der DB-Wert unverändert (verhindert
  // Reset auf 1 durch alte Builds, die das Feld nicht senden).
  // PROJ-30: Die Wortzahl zählt der Server selbst, der Client liefert sie nicht.
  const wordCount = countWordsFromBody(body);
  const updatePayload: Record<string, unknown> = {
    title,
    body: (body ?? null) as never,
    word_count: wordCount,
    image_sections: stripped as never,
    color_page_count: colorPageCount,
    updated_at: new Date().toISOString(),
  };
  if (pageCount !== undefined) {
    updatePayload.page_count = pageCount;
  }

  const { data: savedRows, error } = await supabase
    .from("chapters")
    .update(updatePayload as never)
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .select("id, word_count, updated_at");

  // PROJ-26: Ohne Treffer wurde das Kapitel inzwischen gelöscht. Das darf nicht
  // als „Gespeichert" erscheinen, sonst schreibt jemand unbemerkt ins Leere.
  if (error || !savedRows || savedRows.length === 0) {
    return { error: "Speichern fehlgeschlagen." };
  }

  // PROJ-30: Bleibt die Wortzahl gleich (zum Beispiel ein Tippfehler), kann die
  // Datenbank das nicht von einem Schreibweg ohne Zählung unterscheiden und
  // leert sie. Dann wird sie nachgetragen, aber nur, wenn inzwischen niemand
  // anderes gespeichert hat. Scheitert das, zählt die Übersicht dieses Kapitel live.
  const saved = savedRows[0] as { word_count: number | null; updated_at: string };
  if (saved.word_count === null) {
    const { error: countError } = await supabase
      .from("chapters")
      .update({ word_count: wordCount })
      .eq("id", chapterId)
      .eq("project_id", projectId)
      .eq("updated_at", saved.updated_at);
    if (countError) console.error(`[chapter-autosave] word count failed: ${countError.message}`);
  }
  return { ok: true };
}

/**
 * PROJ-30: Schreibt nur die Seitenzahl. Das bloße Öffnen eines Kapitels darf
 * Text, Titel und Bilder nie anfassen, sie könnten inzwischen neuer sein.
 */
export async function chapterPageCountAction(input: {
  projectId: string;
  chapterId: string;
  pageCount: number;
}): Promise<{ ok?: true; error?: string }> {
  const parsed = pageCountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, pageCount } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const accessError = await projectWriteBlockedError(supabase, projectId);
  if (accessError) return { error: accessError };

  const { data: savedRows, error } = await supabase
    .from("chapters")
    .update({ page_count: pageCount })
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .select("id");
  if (error || !savedRows || savedRows.length === 0) {
    return { error: "Speichern fehlgeschlagen." };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bild-Upload in zwei Schritten (Fix 2026-11-20)
//
// Früher ging die Bilddatei als FormData durch eine Server Action. Next.js
// erlaubt dort nur 1 MB, Vercel höchstens 4,5 MB pro Anfrage — zugeschnittene
// Fotos sind fast immer größer, der Upload brach mit „Body exceeded 1 MB
// limit" ab. Jetzt:
//   1. `chapterImageUploadPrepareAction` prüft Login, Mitgliedschaft und
//      Kapitel, legt den Speicherpfad fest und stellt einen einmaligen
//      Upload-Link aus (Supabase `createSignedUploadUrl`).
//   2. Der Browser lädt die Datei mit diesem Link direkt in den Bucket
//      `chapter-heroes` (Bucket-Grenzen: 10 MB, nur Bildformate).
//   3. `chapterImageUploadCommitAction` prüft Pfad und Datei und trägt das
//      Bild in `image_sections` ein.
// Den Pfad bestimmt immer der Server; der Client kann nur genau diesen einen
// Pfad beschreiben.
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function requireMemberAndChapter(projectId: string, chapterId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." } as const;

  // Membership-Check (Defense-in-depth; storage-RLS prüft ebenfalls).
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!membership) return { error: "Projekt nicht gefunden." } as const;

  const accessError = await projectWriteBlockedError(supabase, projectId);
  if (accessError) return { error: accessError } as const;

  const { data: chapter, error: loadErr } = await supabase
    .from("chapters")
    .select("image_sections")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .single();
  if (loadErr || !chapter) return { error: "Kapitel nicht gefunden." } as const;

  return { supabase, sections: chapter.image_sections as unknown as ImageSections } as const;
}

export async function chapterImageUploadPrepareAction(input: {
  projectId: string;
  chapterId: string;
  section: "start" | "end";
  contentType: string;
  size: number;
}): Promise<{ upload?: { imageId: string; storagePath: string; token: string }; error?: string }> {
  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, contentType } = parsed.data;
  if (!ALLOWED_MIME.has(contentType)) return { error: "Nur JPEG, PNG oder WebP erlaubt." };

  const ctx = await requireMemberAndChapter(projectId, chapterId);
  if ("error" in ctx) return { error: ctx.error };

  // Datei-Endung aus dem MIME-Type ableiten (sicher: nicht aus Filename).
  const imageId = crypto.randomUUID();
  const storagePath = `${projectId}/${chapterId}/${imageId}.${IMAGE_EXT[contentType]}`;

  const { data, error } = await ctx.supabase.storage
    .from("chapter-heroes")
    .createSignedUploadUrl(storagePath);
  if (error || !data?.token) return { error: "Upload fehlgeschlagen." };

  return { upload: { imageId, storagePath, token: data.token } };
}

export async function chapterImageUploadCommitAction(input: {
  projectId: string;
  chapterId: string;
  section: "start" | "end";
  imageId: string;
  storagePath: string;
}): Promise<{ image?: ChapterImage; error?: string }> {
  const parsed = commitUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, section, imageId, storagePath } = parsed.data;

  // Nur genau den Pfad akzeptieren, den Schritt 1 vergeben haben kann.
  const allowed = Object.values(IMAGE_EXT).map((ext) => `${projectId}/${chapterId}/${imageId}.${ext}`);
  if (!allowed.includes(storagePath)) return { error: "Ungültiger Speicherpfad." };

  const ctx = await requireMemberAndChapter(projectId, chapterId);
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, sections } = ctx;

  // Bild schon eingetragen (doppelter Aufruf)? Dann nichts doppelt anlegen.
  const already = [...sections.start.images, ...sections.end.images].some((i) => i.id === imageId);

  // Datei muss im Bucket liegen — die Signed-URL schlägt sonst fehl.
  const { data: signed, error: signErr } = await supabase.storage
    .from("chapter-heroes")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) return { error: "Upload fehlgeschlagen." };

  const newEntry: ChapterImage = {
    id: imageId,
    storage_path: storagePath,
    signed_url: "",
    alt: "",
  };

  if (!already) {
    const next: ImageSections = {
      start: { ...sections.start },
      end: { ...sections.end },
    };
    next[section] = {
      ...next[section],
      images: [...next[section].images, newEntry],
    };

    const { error: updateErr } = await supabase
      .from("chapters")
      .update({
        image_sections: next as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapterId)
      .eq("project_id", projectId);
    if (updateErr) {
      // Storage-Rollback bei DB-Fehler — Datei wieder entfernen.
      await supabase.storage.from("chapter-heroes").remove([storagePath]);
      return { error: "Bild konnte nicht gespeichert werden." };
    }
  }

  return { image: { ...newEntry, signed_url: signed.signedUrl } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bild-Löschen (Storage + JSONB atomar)
// ─────────────────────────────────────────────────────────────────────────────

export async function chapterImageDeleteAction(input: {
  projectId: string;
  chapterId: string;
  section: "start" | "end";
  imageId: string;
}): Promise<{ ok?: true; error?: string }> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, section, imageId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const accessError = await projectWriteBlockedError(supabase, projectId);
  if (accessError) return { error: accessError };

  const { data: chapter, error: loadErr } = await supabase
    .from("chapters")
    .select("image_sections")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .single();
  if (loadErr || !chapter) return { error: "Kapitel nicht gefunden." };

  const sections = chapter.image_sections as unknown as ImageSections;
  const target = sections[section].images.find((i) => i.id === imageId);
  if (!target) return { error: "Bild nicht gefunden." };

  const next: ImageSections = {
    start: { ...sections.start },
    end: { ...sections.end },
  };
  next[section] = {
    ...next[section],
    images: next[section].images.filter((i) => i.id !== imageId),
  };

  const { error: updateErr } = await supabase
    .from("chapters")
    .update({
      image_sections: next as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId)
    .eq("project_id", projectId);
  if (updateErr) return { error: "Bild konnte nicht entfernt werden." };

  // Storage erst nach erfolgreichem JSONB-Update entfernen — falls Storage-
  // Delete fehlschlägt, ist das Bild im DOM weg; verwaiste Storage-Objekte
  // sind tolerierbar (Cleanup-Job kann später laufen). Anders herum würden
  // wir Daten-Inkonsistenz riskieren.
  await supabase.storage.from("chapter-heroes").remove([target.storage_path]);

  return { ok: true };
}
