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

// Anzahl Bilder, die auf den ersten Chunk passen — kann von perPage abweichen
// wenn z. B. der Erste-Seite-Header bereits Platz wegnimmt.
export function imageOverflowPages(
  section: ImageSectionData,
  firstChunkSize?: number,
): number {
  const per = imagesPerPage(section.layout);
  const first = firstChunkSize ?? per;
  if (section.images.length <= first) return 0;
  return 1 + Math.max(0, Math.ceil((section.images.length - first) / per) - 1);
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export type ChapterDraft = {
  title: string;
  body: unknown;
  imageSections: ImageSections;
  colorPageCount: number;
};
