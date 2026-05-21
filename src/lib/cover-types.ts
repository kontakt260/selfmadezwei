// PROJ-10 Cover-Editor — gemeinsame Typen für Server, Client und Render.

/**
 * Cover-Daten in der für den Render verwendeten Form.
 *
 * Titel kommt IMMER aus `projects.title` (Single Source of Truth) — er
 * wird hier mitgereicht, damit der Renderer in jedem Kontext ohne
 * zusätzlichen DB-Roundtrip funktioniert. Bei Auto-Save vom Editor wird
 * der Titel separat in `projects.title` persistiert.
 */
export type CoverData = {
  title: string; // aus projects.title
  subtitle: string; // metadata.subtitle, leer = ""
  authorLine: string; // metadata.author_line, leer = ""
  themeId: string; // theme-Slug oder Default
  colorId: string; // metadata.background_color oder Default
  imageUrl: string | null; // signed URL falls Foto vorhanden, sonst null
};

/**
 * Roh-Form aus der DB (project_covers-Row). Wird vom Server-Lader in
 * `CoverData` übersetzt, indem signed URLs erzeugt und die metadata-
 * Schlüssel ausgepackt werden.
 */
export type CoverRowRaw = {
  image_url: string | null;
  theme: string | null;
  metadata: { subtitle?: string; author_line?: string; background_color?: string; schema_version?: number } | null;
};

/**
 * Render-Größen-Kontext. Steuert über CSS-Variablen (font-Skalierung,
 * Padding-Anteile) nur das Layout, NICHT die Datenstruktur.
 */
export type CoverSize = "editor" | "overview" | "card";

export const COVER_SCHEMA_VERSION = 1;
