"use client";

import { type Chapter } from "@/lib/projektuebersicht-chapters";
import type { ErzaehlImpuls } from "@/lib/projektuebersicht-erzaehl-impulse";

// ─── Server Action Types ──────────────────────────────────────────────────────

type AddChapterAction = (formData: FormData) => Promise<{ chapterId?: string; error?: string }>;
type RenameChapterAction = (formData: FormData) => Promise<{ error?: string }>;
type DeleteChapterAction = (formData: FormData) => Promise<{ error?: string }>;
type SaveChapterOrderAction = (formData: FormData) => Promise<{ error?: string }>;
type AddImpulseChapterAction = (formData: FormData) => Promise<{ chapterId?: string; error?: string }>;

export type Props = {
  projectId: string;
  initialChapters: Chapter[];
  /** PROJ-28: Zugang abgelaufen. Kapitel lassen sich nur noch ansehen. */
  readOnly: boolean;
  /** PROJ-8: Server-geladener Impuls-Katalog (UUIDs aus impulse_catalog).
   * Wird vom Shuffle-Modal genutzt — beim „Impuls übernehmen" geht die
   * UUID als impulseId zur Server-Action und landet in chapters.source_impulse_id. */
  impulses: ErzaehlImpuls[];
  addChapterAction: AddChapterAction;
  addImpulseChapterAction: AddImpulseChapterAction;
  renameChapterAction: RenameChapterAction;
  deleteChapterAction: DeleteChapterAction;
  saveChapterOrderAction: SaveChapterOrderAction;
};
