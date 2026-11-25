"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { countWordsFromBody } from "@/lib/kapiteleditor/countWords";
import { stripSoftHyphensFromBody } from "@/lib/hyphenation";
import { projectWriteBlockedError } from "@/lib/projects/project-access";
import { BOOK_FONT_IDS, bookFontOrDefault, type BookFontId } from "@/lib/book-fonts";
import {
  MAX_IMAGES_PER_CHAPTER,
  MAX_IMAGES_PER_SECTION,
  allImages,
  checkImageSections,
  getImageSection,
  imageLimitError,
  imageSectionsForSave,
  isImageSectionId,
  isInProjectFolder,
  parseImageSections,
  withImageSection,
} from "@/lib/kapiteleditor/image-sections";
import type { ImageSections, ChapterImage } from "@/lib/kapiteleditor/types";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Ungültige ID.");

const layoutSchema = z.enum(["1-spaltig", "2-spaltig"]);
const imageFormatSchema = z.enum(["quer", "hoch"]);
// PROJ-34: `start`, `end` oder die ID eines Abschnitts im Text.
const sectionIdSchema = z.string().refine(isImageSectionId, "Ungültiger Bildabschnitt.");

const chapterImageSchema: z.ZodType<ChapterImage> = z.object({
  id: z.string().min(1).max(120),
  storage_path: z.string().min(1).max(500),
  // signed_url ist server-erzeugt; wir verwerfen den Client-Wert beim Speichern.
  signed_url: z.string().max(2000).optional().default(""),
  alt: z.string().max(500).default(""),
  format: imageFormatSchema.optional(),
});

const imageSectionSchema = z.object({
  layout: layoutSchema,
  images: z
    .array(chapterImageSchema)
    .max(
      MAX_IMAGES_PER_SECTION,
      `Ein Bildabschnitt kann höchstens ${MAX_IMAGES_PER_SECTION} Fotos enthalten.`,
    ),
});

const imageSectionsSchema = z.object({
  start: imageSectionSchema,
  end: imageSectionSchema,
  inline: z.record(uuidSchema, imageSectionSchema).optional(),
  placed: z.literal(true).optional(),
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
  // PROJ-32: Schrift, mit der der Editor die Seitenzahl gemessen hat. Fehlt sie
  // (alter Client), war es PT Serif.
  pageCountFont: z.enum(BOOK_FONT_IDS).optional(),
});

const pageCountSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  pageCount: z.number().int().min(1).max(999),
  pageCountFont: z.enum(BOOK_FONT_IDS).optional(),
  // PROJ-32 Neusatz: nur speichern, wenn das Kapitel seit dem Laden unverändert ist.
  ifUnchangedSince: z.string().min(10).max(64).optional(),
});

const bookFontSchema = z.object({
  projectId: uuidSchema,
  bookFont: z.enum(BOOK_FONT_IDS, { message: "Diese Schrift gibt es nicht." }),
});

/**
 * PROJ-32: Buchschrift laden, wenn eine Seitenzahl gespeichert werden soll.
 * `null` heißt: nicht prüfbar, dann wird keine Seitenzahl gespeichert.
 */
async function currentBookFont(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<BookFontId | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("book_font")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return bookFontOrDefault(data.book_font);
}

const BOOK_FONT_SAVE_ERROR =
  "Die Schrift konnte nicht geändert werden. Bitte versuchen Sie es erneut.";

/** Ergebnis beim Speichern. `bookFont`: Seitenzahl nicht übernommen, das Buch steht inzwischen in dieser Schrift. */
type SaveResult = { ok?: true; error?: string; bookFont?: BookFontId };

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const prepareUploadSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: sectionIdSchema,
  contentType: z.string().max(100),
  size: z.number().int().min(1).max(MAX_FILE_BYTES, "Datei zu groß. Maximum 10 MB."),
});

const commitUploadSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: sectionIdSchema,
  imageId: uuidSchema,
  storagePath: z.string().max(200),
  format: imageFormatSchema.optional(),
});

const deleteSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: sectionIdSchema,
  imageId: z.string().min(1).max(120),
});

const imageLinksSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  paths: z.array(z.string().min(1).max(500)).min(1).max(MAX_IMAGES_PER_CHAPTER),
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
  pageCountFont?: BookFontId;
}): Promise<SaveResult> {
  const parsed = autosaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, title, imageSections, colorPageCount, pageCount } = parsed.data;
  const pageCountFont = bookFontOrDefault(parsed.data.pageCountFont);
  // PROJ-35: Im gespeicherten Text stehen nie Trennzeichen, auch nicht aus
  // eingefügtem Text oder älteren Editor-Ständen.
  const body = stripSoftHyphensFromBody(parsed.data.body);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const [accessError, bookFont] = await Promise.all([
    projectWriteBlockedError(supabase, projectId),
    pageCount !== undefined ? currentBookFont(supabase, projectId) : Promise.resolve(null),
  ]);
  if (accessError) return { error: accessError };

  // Ohne Bildlinks (server-erzeugt zur Laufzeit) und ohne entfernte Abschnitte.
  // Der Editor behält entfernte Abschnitte für „Rückgängig" im Speicher, sie
  // zählen deshalb nicht zu den Grenzen.
  const stripped = imageSectionsForSave(imageSections, body);

  // PROJ-34: Grenzen, Dateipfade und Abschnitte im Text prüft immer der Server.
  const imageCheck = checkImageSections({ projectId, chapterId, sections: stripped, body });
  if (!imageCheck.ok) return { error: imageCheck.error };
  if (imageCheck.foreignPaths.length > 0) {
    // Ein Pfad außerhalb des Kapitelordners ist nur erlaubt, wenn das Kapitel
    // ihn schon gespeichert hat. So bleiben alte Kapitel speicherbar, neue
    // fremde Pfade kommen aber nicht hinein.
    const { data: stored, error: storedError } = await supabase
      .from("chapters")
      .select("image_sections")
      .eq("id", chapterId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (storedError || !stored) return { error: "Speichern fehlgeschlagen." };
    const known = new Set(
      allImages(parseImageSections(stored.image_sections)).map((image) => image.storage_path),
    );
    if (imageCheck.foreignPaths.some((path) => !known.has(path))) {
      return { error: "Ungültiger Speicherpfad." };
    }
  }

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
  // PROJ-32: Die Seitenzahl zählt nur, wenn sie mit der aktuellen Buchschrift
  // gemessen wurde. Hat jemand das Kapitel noch mit der alten Schrift offen,
  // wird sein Text gespeichert, seine Seitenzahl nicht.
  const pageCountAccepted = pageCount !== undefined && bookFont === pageCountFont;
  if (pageCountAccepted) {
    updatePayload.page_count = pageCount;
    updatePayload.page_count_font = pageCountFont;
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
  if (pageCount !== undefined && !pageCountAccepted && bookFont) return { ok: true, bookFont };
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
  pageCountFont?: BookFontId;
  ifUnchangedSince?: string;
}): Promise<SaveResult> {
  const parsed = pageCountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, pageCount, ifUnchangedSince } = parsed.data;
  const pageCountFont = bookFontOrDefault(parsed.data.pageCountFont);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const [accessError, bookFont] = await Promise.all([
    projectWriteBlockedError(supabase, projectId),
    currentBookFont(supabase, projectId),
  ]);
  if (accessError) return { error: accessError };
  if (!bookFont) return { error: "Speichern fehlgeschlagen." };
  // PROJ-32: Mit einer anderen Schrift gemessen. Das ist kein Fehler, die Zahl
  // wird nur nicht übernommen.
  if (bookFont !== pageCountFont) return { ok: true, bookFont };

  let update = supabase
    .from("chapters")
    .update({ page_count: pageCount, page_count_font: pageCountFont })
    .eq("id", chapterId)
    .eq("project_id", projectId);
  // Hat jemand das Kapitel inzwischen geändert, passt die Zahl nicht mehr. Es
  // bleibt veraltet und wird neu gesetzt.
  if (ifUnchangedSince) update = update.eq("updated_at", ifUnchangedSince);
  const { data: savedRows, error } = await update.select("id");
  if (error || !savedRows || savedRows.length === 0) {
    return { error: "Speichern fehlgeschlagen." };
  }
  return { ok: true };
}

/**
 * PROJ-32: Schrift für das ganze Buch ändern. Erlaubt für alle Mitglieder, die
 * das Buch bearbeiten dürfen, nicht im Lesemodus. Die Datenbank prüft die
 * Liste zusätzlich, RLS die Mitgliedschaft.
 */
export async function setBookFontAction(input: {
  projectId: string;
  bookFont: BookFontId;
}): Promise<{ ok?: true; error?: string }> {
  const parsed = bookFontSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, bookFont } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const [membership, accessError] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    projectWriteBlockedError(supabase, projectId),
  ]);
  if (membership.error) return { error: BOOK_FONT_SAVE_ERROR };
  if (!membership.data) return { error: "Projekt nicht gefunden." };
  if (accessError) return { error: accessError };

  const { data: savedRows, error } = await supabase
    .from("projects")
    .update({ book_font: bookFont, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("id");
  if (error || !savedRows || savedRows.length === 0) return { error: BOOK_FONT_SAVE_ERROR };
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

  return { supabase, sections: parseImageSections(chapter.image_sections) } as const;
}

function limitAfterAdding(sections: ImageSections, sectionId: string): string | null {
  return imageLimitError(
    (getImageSection(sections, sectionId)?.images.length ?? 0) + 1,
    allImages(sections).length + 1,
  );
}

export async function chapterImageUploadPrepareAction(input: {
  projectId: string;
  chapterId: string;
  section: string;
  contentType: string;
  size: number;
}): Promise<{ upload?: { imageId: string; storagePath: string; token: string }; error?: string }> {
  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, section, contentType } = parsed.data;
  if (!ALLOWED_MIME.has(contentType)) return { error: "Nur JPEG, PNG oder WebP erlaubt." };

  const ctx = await requireMemberAndChapter(projectId, chapterId);
  if ("error" in ctx) return { error: ctx.error };

  const limit = limitAfterAdding(ctx.sections, section);
  if (limit) return { error: limit };

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
  section: string;
  imageId: string;
  storagePath: string;
  format?: "quer" | "hoch";
}): Promise<{ image?: ChapterImage; error?: string }> {
  const parsed = commitUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, section, imageId, storagePath, format } = parsed.data;

  // Nur genau den Pfad akzeptieren, den Schritt 1 vergeben haben kann.
  const allowed = Object.values(IMAGE_EXT).map((ext) => `${projectId}/${chapterId}/${imageId}.${ext}`);
  if (!allowed.includes(storagePath)) return { error: "Ungültiger Speicherpfad." };

  const ctx = await requireMemberAndChapter(projectId, chapterId);
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, sections } = ctx;

  // Bild schon eingetragen (doppelter Aufruf)? Dann nichts doppelt anlegen.
  const existing = allImages(sections).find((i) => i.id === imageId);

  if (!existing) {
    const limit = limitAfterAdding(sections, section);
    if (limit) {
      await supabase.storage.from("chapter-heroes").remove([storagePath]);
      return { error: limit };
    }
  }

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
    ...(format === "hoch" ? { format } : {}),
  };

  if (!existing) {
    // PROJ-34: Ein neuer Abschnitt entsteht hier mit seinem ersten Foto.
    const target = getImageSection(sections, section) ?? {
      layout: "1-spaltig" as const,
      images: [],
    };
    const next = withImageSection(sections, section, {
      ...target,
      images: [...target.images, newEntry],
    });

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

  return { image: { ...(existing ?? newEntry), signed_url: signed.signedUrl } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Frische Bildlinks (PROJ-34)
//
// Bildlinks gelten eine Stunde. Holt „Rückgängig" später einen Abschnitt zurück,
// braucht der Editor neue Links. Auch im Lesemodus erlaubt, nur für Dateien im
// Ordner dieses Projekts und mit den Rechten der angemeldeten Person.
// ─────────────────────────────────────────────────────────────────────────────

export async function chapterImageLinksAction(input: {
  projectId: string;
  chapterId: string;
  paths: string[];
}): Promise<{ links?: Record<string, string>; error?: string }> {
  const parsed = imageLinksSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, paths } = parsed.data;
  if (paths.some((path) => !isInProjectFolder(path, projectId))) {
    return { error: "Ungültiger Speicherpfad." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const [membership, chapter] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("chapters")
      .select("id")
      .eq("id", chapterId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  if (membership.error || !membership.data) return { error: "Projekt nicht gefunden." };
  if (chapter.error || !chapter.data) return { error: "Kapitel nicht gefunden." };

  const { data: signed, error } = await supabase.storage
    .from("chapter-heroes")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) return { error: "Bildlinks konnten nicht geladen werden." };

  const links: Record<string, string> = {};
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl && !item.error) links[item.path] = item.signedUrl;
  }
  return { links };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bild-Löschen
// ─────────────────────────────────────────────────────────────────────────────

export async function chapterImageDeleteAction(input: {
  projectId: string;
  chapterId: string;
  section: string;
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

  const sections = parseImageSections(chapter.image_sections);
  const targetSection = getImageSection(sections, section);
  if (!targetSection?.images.some((i) => i.id === imageId)) {
    return { error: "Bild nicht gefunden." };
  }

  // PROJ-34: Ohne Fotos gibt es keinen Abschnitt mehr.
  const remaining = targetSection.images.filter((i) => i.id !== imageId);
  const next = withImageSection(
    sections,
    section,
    remaining.length > 0 ? { ...targetSection, images: remaining } : null,
  );

  // Die Datei bleibt zunächst liegen: Die Datenbank setzt sie auf die
  // Aufräumliste, der tägliche Cron löscht sie nach 14 Tagen (PROJ-34).
  const { error: updateErr } = await supabase
    .from("chapters")
    .update({
      image_sections: next as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId)
    .eq("project_id", projectId);
  if (updateErr) return { error: "Bild konnte nicht entfernt werden." };

  return { ok: true };
}
