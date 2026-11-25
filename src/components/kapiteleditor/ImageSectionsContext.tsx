"use client";

import { createContext, useContext } from "react";
import type { ChapterImage, ImageSectionData } from "@/lib/kapiteleditor/types";
import type { UploadedImage } from "./ImageUploadDialog";
import type { FreshLinks } from "./freshImageLinks";

// PROJ-34: Bildabschnitte stehen als Blöcke im Text. TipTap rendert sie getrennt
// vom Editor, deshalb erreichen sie Daten und Aktionen über diesen Kontext.
export type ImageSectionsApi = {
  sectionById: (id: string) => ImageSectionData | undefined;
  readOnly: boolean;
  /** Zoom-Stufe der Seiten. Verschiebungen beim Ziehen werden dadurch geteilt. */
  zoom: number;
  /** Frische Bildlinks und Ladeversuch nach Dateipfad, wenn ein Foto nicht geladen hat. */
  freshLinks: FreshLinks;
  canAddPhoto: (sectionId: string) => boolean;
  changeSection: (id: string, next: ImageSectionData) => void;
  uploadPhoto: (sectionId: string, image: UploadedImage) => Promise<ChapterImage>;
  deletePhoto: (sectionId: string, image: ChapterImage) => Promise<void>;
  /** Entfernt den Abschnitt mit seinem letzten Foto. „Rückgängig" holt ihn zurück. */
  removeSection: (id: string) => void;
  onPhotoError: (storagePath: string) => void;
};

const ImageSectionsContext = createContext<ImageSectionsApi | null>(null);

export const ImageSectionsProvider = ImageSectionsContext.Provider;

export function useImageSections(): ImageSectionsApi | null {
  return useContext(ImageSectionsContext);
}
