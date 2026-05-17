import type { ReactNode } from "react";
import { ChapterSectionClient, type ChapterSectionHeaderApi } from "./ChapterSectionClient";
import type { Chapter } from "@/lib/projektuebersicht-chapters";

function IconBook() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={4} y={5.5} width={3} height={3} fill="#96B897" />
      <path d="M10 7h11" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
      <rect x={4} y={10.5} width={3} height={3} fill="#96B897" />
      <path d="M10 12h11" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
      <rect x={4} y={15.5} width={3} height={3} fill="#96B897" />
      <path d="M10 17h11" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

function IconPlus({ color = "#534B42" }: { color?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex min-w-0 flex-row items-center gap-2 sm:gap-3">
        <span className="shrink-0 [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
        <h2 className="[font-family:var(--font-pt-serif)] min-w-0 text-xl leading-7 text-[#3E3831] sm:text-2xl sm:leading-8">
          {title}
        </h2>
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 lg:w-auto lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

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
      renderSectionHeader={({
        openAddOwnChapterModal,
        openErzaehlImpulsModal,
        chapterOrderDirty,
        commitChapterOrder,
        savingOrder,
      }: ChapterSectionHeaderApi) => (
        <SectionHeader
          icon={<IconBook />}
          title="Kapitel"
          actions={
            <>
              {chapterOrderDirty ? (
                <button
                  type="button"
                  onClick={commitChapterOrder}
                  disabled={savingOrder}
                  className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 border border-[#96B897] bg-[#EAF0EA] px-3 text-sm font-bold leading-6 text-[#3E5A40] transition-colors hover:bg-[#dfe9df] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto sm:px-4 sm:text-base"
                >
                  {savingOrder ? "Wird gespeichert …" : "Reihenfolge speichern"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={openAddOwnChapterModal}
                className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#0A0909]/5 px-3 text-sm font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 sm:h-10 sm:w-auto sm:px-4 sm:text-base"
              >
                <IconPlus color="#534B42" />
                Eigenes Kapitel
              </button>
              <button
                type="button"
                onClick={openErzaehlImpulsModal}
                className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#D0BCA6] px-3 text-sm font-bold leading-6 text-white transition-colors hover:bg-[#c0ad98] sm:h-10 sm:w-auto sm:px-4 sm:text-base"
              >
                <IconPlus color="#FFFFFF" />
                Erzähl-Impuls
              </button>
            </>
          }
        />
      )}
    />
  );
}
