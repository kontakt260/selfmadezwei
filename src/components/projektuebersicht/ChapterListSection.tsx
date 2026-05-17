import { ChapterSectionClient } from "./ChapterSectionClient";
import type { Chapter } from "@/lib/projektuebersicht-chapters";

type Props = {
  projectId: string;
  initialChapters: Chapter[];
  addChapterAction: (fd: FormData) => Promise<{ chapterId?: string; error?: string }>;
  addImpulseChapterAction: (fd: FormData) => Promise<{ chapterId?: string; error?: string }>;
  renameChapterAction: (fd: FormData) => Promise<{ error?: string }>;
  deleteChapterAction: (fd: FormData) => Promise<{ error?: string }>;
  saveChapterOrderAction: (fd: FormData) => Promise<{ error?: string }>;
};

export function ChapterListSection({
  projectId,
  initialChapters,
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
      addChapterAction={addChapterAction}
      addImpulseChapterAction={addImpulseChapterAction}
      renameChapterAction={renameChapterAction}
      deleteChapterAction={deleteChapterAction}
      saveChapterOrderAction={saveChapterOrderAction}
    />
  );
}
