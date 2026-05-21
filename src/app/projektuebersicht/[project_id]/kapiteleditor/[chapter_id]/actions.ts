"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
  section: z.enum(["start", "end"]),
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
  const updatePayload: Record<string, unknown> = {
    title,
    body: (body ?? null) as never,
    image_sections: stripped as never,
    color_page_count: colorPageCount,
    updated_at: new Date().toISOString(),
  };
  if (pageCount !== undefined) {
    updatePayload.page_count = pageCount;
  }

  const { error } = await supabase
    .from("chapters")
    .update(updatePayload as never)
    .eq("id", chapterId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Speichern fehlgeschlagen." };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bild-Upload
// ─────────────────────────────────────────────────────────────────────────────

export async function chapterImageUploadAction(
  formData: FormData,
): Promise<{ image?: ChapterImage; error?: string }> {
  const parsed = uploadSchema.safeParse({
    projectId: formData.get("projectId"),
    chapterId: formData.get("chapterId"),
    section: formData.get("section"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { projectId, chapterId, section } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Datei fehlt." };
  if (file.size === 0) return { error: "Datei ist leer." };
  if (file.size > MAX_FILE_BYTES) return { error: "Datei zu groß. Maximum 10 MB." };
  if (!ALLOWED_MIME.has(file.type)) return { error: "Nur JPEG, PNG oder WebP erlaubt." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Membership-Check (Defense-in-depth; storage-RLS prüft ebenfalls).
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!membership) return { error: "Projekt nicht gefunden." };

  // Aktuellen Zustand laden, image_sections atomar via RPC patchen.
  const { data: chapter, error: loadErr } = await supabase
    .from("chapters")
    .select("image_sections")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .single();
  if (loadErr || !chapter) return { error: "Kapitel nicht gefunden." };

  const sections = chapter.image_sections as unknown as ImageSections;

  // Datei-Endung aus dem MIME-Type ableiten (sicher: nicht aus Filename).
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const imageId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${projectId}/${chapterId}/${imageId}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from("chapter-heroes")
    .upload(storagePath, buf, { contentType: file.type, upsert: false });
  if (uploadErr) return { error: "Upload fehlgeschlagen." };

  // image_sections updaten.
  const next: ImageSections = {
    start: { ...sections.start },
    end: { ...sections.end },
  };
  const newEntry: ChapterImage = {
    id: imageId,
    storage_path: storagePath,
    signed_url: "",
    alt: "",
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

  const { data: signed, error: signErr } = await supabase.storage
    .from("chapter-heroes")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signErr) {
    // Bild wurde gespeichert, aber Signed-URL fehlte — Client kriegt einen Hint.
    return { error: "Bild hochgeladen, aber Anzeige-URL fehlgeschlagen." };
  }

  return {
    image: { ...newEntry, signed_url: signed?.signedUrl ?? "" },
  };
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
