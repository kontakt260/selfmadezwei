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

export type SaveState = "idle" | "saving" | "saved" | "error";

export type ChapterDraft = {
  title: string;
  body: unknown;
  imageSections: ImageSections;
  colorPageCount: number;
};
