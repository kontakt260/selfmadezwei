import { ChapterSectionClient } from "./ChapterSectionClient";
import type { Chapter } from "@/lib/projektuebersicht-chapters";
import type { ErzaehlImpuls } from "@/lib/projektuebersicht-erzaehl-impulse";

type Props = {
  projectId: string;
  initialChapters: Chapter[];
  /** PROJ-8: server-geladener Impuls-Katalog. Wird als Prop an den Client
   * gereicht — das Modal öffnet ohne Roundtrip. */
  impulses: ErzaehlImpuls[];
  addChapterAction: (fd: FormData) => Promise<{ chapterId?: string; error?: string }>;
  addImpulseChapterAction: (fd: FormData) => Promise<{ chapterId?: string; error?: string }>;
  renameChapterAction: (fd: FormData) => Promise<{ error?: string }>;
  deleteChapterAction: (fd: FormData) => Promise<{ error?: string }>;
  saveChapterOrderAction: (fd: FormData) => Promise<{ error?: string }>;
};

export function ChapterListSection({
  projectId,
  initialChapters,
  impulses,
  addChapterAction,
  addImpulseChapterAction,
  renameChapterAction,
  deleteChapterAction,
  saveChapterOrderAction,
}: Props) {
  return (
    <ChapterSectionClient
      projectId={projectId}
      initialChapters={initialChapters}
      impulses={impulses}
      addChapterAction={addChapterAction}
      addImpulseChapterAction={addImpulseChapterAction}
      renameChapterAction={renameChapterAction}
      deleteChapterAction={deleteChapterAction}
      saveChapterOrderAction={saveChapterOrderAction}
    />
  );
}
