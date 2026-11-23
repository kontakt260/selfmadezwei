export type ImageLayout = "1-spaltig" | "2-spaltig";

export type ChapterImage = {
  id: string;
  storage_path: string;
  signed_url: string;
  alt: string;
};

export type ImageSectionData = {
  layout: ImageLayout;
  images: ChapterImage[];
};

export type ImageSections = {
  start: ImageSectionData;
  end: ImageSectionData;
};

export const EMPTY_IMAGE_SECTIONS: ImageSections = {
  start: { layout: "1-spaltig", images: [] },
  end: { layout: "1-spaltig", images: [] },
};

// Maximale Bilder pro Seite, bevor ein Auto-Page-Break die Sektion teilt.
// 1-spaltig: 2 Bilder/Seite (3:2 Aspect × 100% Content-Breite ≈ halbe Seite)
// 2-spaltig: 4 Bilder/Seite (2 Reihen × 2 Bilder, 3:2 Aspect bei halber Breite)
export function imagesPerPage(layout: ImageLayout): number {
  return layout === "2-spaltig" ? 4 : 2;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export type ChapterDraft = {
  title: string;
  body: unknown;
  imageSections: ImageSections;
  colorPageCount: number;
  // PROJ-7: lokale A5-Seitenzahl dieses Kapitels — von der Pagination-
  // Engine nach jedem Settle gemeldet. Server persistiert das als
  // chapters.page_count; DB-Trigger berechnet daraus start_page der
  // Folge-Kapitel neu. `undefined`, solange die Pagination nach dem Laden
  // noch einschwingt — der Server lässt page_count dann unverändert.
  pageCount?: number;
};
