import { ChapterSectionClient } from "./ChapterSectionClient";
import type { Chapter } from "@/lib/projektuebersicht-chapters";
import type { ErzaehlImpuls } from "@/lib/projektuebersicht-erzaehl-impulse";

type Props = {
  projectId: string;
  initialChapters: Chapter[];
  /** PROJ-28: Der Zugang ist abgelaufen, die Liste ist nur noch lesbar. */
  readOnly: boolean;
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
  readOnly,
  impulses,
  addChapterAction,
  addImpulseChapterAction,
  renameChapterAction,
  deleteChapterAction,
  saveChapterOrderAction,
}: Props) {
  // PROJ-26: Die Liste hält ihren Stand lokal. Hat jemand anderes ein Kapitel
  // gelöscht oder angelegt, startet sie mit dem Stand vom Server neu. Eine
  // reine Umsortierung ändert den Schlüssel nicht.
  const chapterSetKey = initialChapters
    .map((chapter) => chapter.id)
    .sort()
    .join(",");

  return (
    <ChapterSectionClient
      key={chapterSetKey}
      projectId={projectId}
      initialChapters={initialChapters}
      readOnly={readOnly}
      impulses={impulses}
      addChapterAction={addChapterAction}
      addImpulseChapterAction={addImpulseChapterAction}
      renameChapterAction={renameChapterAction}
      deleteChapterAction={deleteChapterAction}
      saveChapterOrderAction={saveChapterOrderAction}
    />
  );
}
