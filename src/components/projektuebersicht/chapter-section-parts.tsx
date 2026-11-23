"use client";

import type * as React from "react";
import type { Chapter } from "@/lib/projektuebersicht-chapters";
import { ChapterOpenLink } from "./ChapterOpenLink";

// PROJ-31: Bausteine der Kapitelliste, unverändert aus ChapterSectionClient verschoben.
// Dialoge und Zeile sind bewusst einfache Funktionen statt Komponenten: So bleibt
// der React-Baum wie zuvor, und das JavaScript der Projektseite wächst nicht.

// ─── Icons ───────────────────────────────────────────────────────────────────

export function IconDrag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx={9} cy={6} r={1.4} fill="#77716A" />
      <circle cx={9} cy={12} r={1.4} fill="#77716A" />
      <circle cx={9} cy={18} r={1.4} fill="#77716A" />
      <circle cx={15} cy={6} r={1.4} fill="#77716A" />
      <circle cx={15} cy={12} r={1.4} fill="#77716A" />
      <circle cx={15} cy={18} r={1.4} fill="#77716A" />
    </svg>
  );
}

export function IconPencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 21h4l11-11-4-4L3 17v4ZM14 6l4 4" stroke="currentColor" strokeWidth={1.67} strokeLinecap="square" />
    </svg>
  );
}

export function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth={1.67} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function IconBook() {
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

export function IconPlus({ color = "#534B42" }: { color?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

export function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex min-w-0 flex-row items-center gap-2 sm:gap-3">
        <span className="shrink-0 [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
        <h2 className="[font-family:var(--font-pt-serif)] min-w-0 text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
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

export function ShuffleIconAttached({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 bg-[#597083] transition-colors group-hover:bg-[#4e6376] ${className ?? "h-6 w-6"}`}
      style={{
        maskImage: "url(/icons/shuffle-on.png)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: "url(/icons/shuffle-on.png)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
      aria-hidden
    />
  );
}

export function deleteChapterContent(
  deleteTarget: Chapter,
  titleId: string,
  descId: string,
  countdownId: string,
  deleteCountdown: number,
  closeDeleteModal: () => void,
  canConfirmDelete: boolean,
  confirmChapterDelete: () => void,
  deletePending: boolean,
) {
  return (
    <>
      <h2 id={titleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
        Kapitel „{deleteTarget.title}&quot; löschen?
      </h2>
      <div id={descId} className="mt-5 space-y-3 text-base leading-relaxed text-[#535252] sm:text-lg">
        <p>Alle geschriebenen Texte gehen verloren.</p>
        <p>Eine Wiederherstellung ist nicht möglich.</p>
        <p>Bitte warten Sie den Countdown ab, um das Kapitel endgültig zu löschen.</p>
      </div>
      <div id={countdownId} className="mt-8 border border-[#e0dcd5] bg-white px-5 py-4 text-center" aria-live="polite">
        {deleteCountdown > 0 ? (
          <p className="text-base leading-relaxed text-[#535252] sm:text-lg">
            Bestätigung möglich in{" "}
            <strong className="text-[#3E3831]">{deleteCountdown} {deleteCountdown === 1 ? "Sekunde" : "Sekunden"}</strong>…
          </p>
        ) : (
          <p className="text-base font-semibold text-[#3E3831] sm:text-lg">
            Sie können das Kapitel jetzt endgültig löschen.
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
        <button type="button" onClick={closeDeleteModal} className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] sm:w-auto">
          Abbrechen
        </button>
        <button type="button" disabled={!canConfirmDelete} onClick={confirmChapterDelete} className="min-h-12 w-full bg-[#53444B] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
          {deletePending ? "Wird gelöscht …" : "Endgültig löschen"}
        </button>
      </div>
    </>
  );
}

export function renameChapterContent(
  editTitleId: string,
  editDescId: string,
  editInputId: string,
  editInputRef: React.RefObject<HTMLInputElement | null>,
  editTitleValue: string,
  setEditTitleValue: (value: string) => void,
  canSaveChapterTitle: boolean,
  renamePending: boolean,
  saveChapterTitle: () => void,
  closeEditModal: () => void,
) {
  return (
    <>
      <h2 id={editTitleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
        Kapitel umbenennen
      </h2>
      <p id={editDescId} className="mt-5 text-base leading-relaxed text-[#535252] sm:text-lg">
        Hier können Sie den Titel des Kapitels ändern.
      </p>
      <label htmlFor={editInputId} className="mt-8 block text-base font-medium text-[#3E3831]">
        Kapitelname
      </label>
      <input
        ref={editInputRef}
        id={editInputId}
        type="text"
        value={editTitleValue}
        onChange={(e) => setEditTitleValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSaveChapterTitle && !renamePending) {
            e.preventDefault();
            saveChapterTitle();
          }
        }}
        maxLength={200}
        autoComplete="off"
        disabled={renamePending}
        className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#6B655E] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
        placeholder="Kapitelname"
      />
      <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
        <button type="button" onClick={closeEditModal} disabled={renamePending} className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:w-auto">
          Abbrechen
        </button>
        <button type="button" disabled={!canSaveChapterTitle || renamePending} onClick={saveChapterTitle} className="min-h-12 w-full bg-[#597083] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#4e6376] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
          {renamePending ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>
    </>
  );
}

export function addChapterContent(
  addTitleId: string,
  addDescId: string,
  addInputId: string,
  addInputRef: React.RefObject<HTMLInputElement | null>,
  addTitleValue: string,
  setAddTitleValue: (value: string) => void,
  canConfirmAddChapter: boolean,
  addPending: boolean,
  confirmAddChapter: () => void,
  closeAddModal: () => void,
) {
  return (
    <>
      <h2 id={addTitleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
        Eigenes Kapitel hinzufügen
      </h2>
      <p id={addDescId} className="mt-5 text-base leading-relaxed text-[#535252] sm:text-lg">
        Geben Sie einen Titel für das neue Kapitel ein. Sie können ihn später jederzeit ändern.
      </p>
      <label htmlFor={addInputId} className="mt-8 block text-base font-medium text-[#3E3831]">
        Kapiteltitel
      </label>
      <input
        ref={addInputRef}
        id={addInputId}
        type="text"
        value={addTitleValue}
        onChange={(e) => setAddTitleValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canConfirmAddChapter) {
            e.preventDefault();
            confirmAddChapter();
          }
        }}
        maxLength={200}
        autoComplete="off"
        disabled={addPending}
        className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#6B655E] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
        placeholder="z. B. Reisen und Begegnungen"
      />
      <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
        <button type="button" onClick={closeAddModal} disabled={addPending} className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:w-auto">
          Abbrechen
        </button>
        <button type="button" disabled={!canConfirmAddChapter} onClick={confirmAddChapter} className="min-h-12 w-full bg-[#597083] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#4e6376] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
          {addPending ? "Wird erstellt …" : "Hinzufügen"}
        </button>
      </div>
    </>
  );
}

export function impulseChapterContent(
  impulseDialogTitleId: string,
  impulseDialogDescId: string,
  currentImpulseCategory: string,
  currentImpulseTitle: string,
  currentImpulsePreviewQuestion: string,
  shuffleImpulse: () => void,
  closeImpulseModal: () => void,
  confirmErzaehlImpulse: () => void,
  impulseAddPending: boolean,
) {
  return (
    <>
      <h2 id={impulseDialogTitleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
        Erzähl-Impuls wählen
      </h2>
      <p id={impulseDialogDescId} className="mt-5 text-base leading-relaxed text-[#535252] sm:text-lg">
        Mischen Sie durch Vorschläge, bis ein Thema passt — dann übernehmen Sie es als neues Kapitel.
      </p>
      <div className="mt-8 border border-[#e0dcd5] bg-white px-5 py-6 sm:px-6 sm:py-8" aria-live="polite" aria-atomic="true">
        {currentImpulseCategory && (
          <p className="[font-family:var(--font-lato)] text-base font-semibold uppercase tracking-wide text-[#5F5A54]">
            {currentImpulseCategory}
          </p>
        )}
        <p className="[font-family:var(--font-pt-serif)] mt-2 text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-10">
          {currentImpulseTitle}
        </p>
        {currentImpulsePreviewQuestion && (
          <p className="mt-4 text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
            {currentImpulsePreviewQuestion}
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-col gap-4">
        <button type="button" onClick={shuffleImpulse} className="group inline-flex min-h-12 w-full items-center justify-center gap-2 border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] sm:w-auto sm:self-start">
          <ShuffleIconAttached />
          Anderen Vorschlag
        </button>
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
          <button type="button" onClick={closeImpulseModal} disabled={impulseAddPending} className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:w-auto">
            Abbrechen
          </button>
          <button type="button" onClick={confirmErzaehlImpulse} disabled={!currentImpulseTitle.trim() || impulseAddPending} className="min-h-12 w-full bg-[#D0BCA6] px-6 py-3.5 text-center text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
            {impulseAddPending ? "Wird erstellt …" : "Impuls übernehmen"}
          </button>
        </div>
      </div>
    </>
  );
}

export function chapterRow(
  chapter: Chapter,
  index: number,
  projectId: string,
  readOnly: boolean,
  dragIndex: number | null,
  overIndex: number | null,
  onDragStart: (index: number) => (e: React.DragEvent) => void,
  onDragEnd: () => void,
  onDragOver: (index: number) => (e: React.DragEvent) => void,
  onDragLeave: () => void,
  onDrop: (index: number) => (e: React.DragEvent) => void,
  openEditModal: (chapter: Chapter) => void,
  openDeleteModal: (chapter: Chapter) => void,
) {
  return (
    <div
      key={chapter.id}
      role="listitem"
      onDragOver={readOnly ? undefined : onDragOver(index)}
      onDragLeave={readOnly ? undefined : onDragLeave}
      onDrop={readOnly ? undefined : onDrop(index)}
      className={`flex flex-col gap-4 border border-transparent bg-[#FAF8F6] p-5 py-5 transition-[opacity,box-shadow] sm:min-h-[6rem] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-7 ${
        dragIndex === index ? "opacity-60" : ""
      } ${
        overIndex === index && dragIndex !== null && dragIndex !== index
          ? "shadow-[inset_0_0_0_2px_#96B897]"
          : ""
      }`}
    >
      <div
        draggable={!readOnly}
        onDragStart={readOnly ? undefined : onDragStart(index)}
        onDragEnd={readOnly ? undefined : onDragEnd}
        className={`flex min-w-0 flex-1 flex-row items-center gap-3 sm:gap-4 ${
          readOnly ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        aria-grabbed={readOnly ? undefined : dragIndex === index}
        aria-label={
          readOnly
            ? `Kapitel ${index + 1}: ${chapter.title}`
            : `Kapitel ${index + 1}: ${chapter.title} — zum Umsortieren ziehen`
        }
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center text-[#77716A] sm:h-7 sm:w-7 ${
            readOnly ? "opacity-40" : ""
          }`}
        >
          <IconDrag className="h-full w-full" />
        </span>
        <span className="w-8 shrink-0 text-lg leading-7 text-[#5F5A54] sm:w-9 sm:text-xl sm:leading-8">
          {index + 1}.
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 className="[font-family:var(--font-pt-serif)] line-clamp-2 text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-9">
            {chapter.title}
          </h4>
          <p className="text-base leading-6 text-[#5F5A54]">
            {chapter.source} • {chapter.words} Wörter
          </p>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-start sm:gap-3">
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          onClick={() => openEditModal(chapter)}
          className="relative z-20 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center bg-[#EAF0EA] text-[#3E3831] transition-colors hover:bg-[#dfe9df] hover:text-[#2d332d]"
          aria-label={`Kapitel „${chapter.title}" umbenennen`}
        >
          <IconPencil className="pointer-events-none h-[18px] w-[18px] shrink-0" />
        </button>
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          onClick={() => openDeleteModal(chapter)}
          className="relative z-20 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center bg-[#FEF2F2] text-[#C81E1E] transition-colors hover:bg-[#FEE2E2] hover:text-[#991B1B]"
          aria-label={`Kapitel „${chapter.title}" löschen`}
        >
          <IconTrash className="pointer-events-none h-[18px] w-[18px] shrink-0" />
        </button>
        {chapter.id.startsWith("optimistic-") ? (
          // Optimistic-Phase: das Kapitel ist noch nicht in der DB,
          // ein Klick auf den echten Link würde /kapiteleditor/
          // optimistic-<ts> → 404 öffnen. Wir rendern stattdessen
          // einen disabled Button, bis die Server-Action die echte
          // chapter.id einsetzt.
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="relative z-20 inline-flex h-12 w-full min-w-0 cursor-not-allowed items-center justify-center bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] opacity-50 sm:w-auto sm:text-lg"
          >
            Wird angelegt …
          </button>
        ) : (
          <ChapterOpenLink
            href={`/projektuebersicht/${projectId}/kapiteleditor/${chapter.id}`}
            draggable={false}
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="relative z-20 inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 sm:w-auto sm:min-w-[10.5rem] sm:text-lg"
          >
            {readOnly ? "Ansehen" : "Bearbeiten"}
          </ChapterOpenLink>
        )}
      </div>
    </div>
  );
}
