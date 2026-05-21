"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CoverRender } from "@/components/cover/CoverRender";
import type { CoverData } from "@/lib/cover-types";

export type ProjectCardData = {
  id: string;
  title: string;
  formattedUpdatedAt: string;
  chapterCount: number;
  userRole: "projektleiter" | "co_author";
  // PROJ-10: Cover-Daten ersetzen das statische Buch-Icon. Default-Werte
  // werden vom Server-Lader synthetisiert, wenn keine project_covers-
  // Row existiert.
  coverData: CoverData;
};

function IconTrash({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M19 6l-1 14H6L5 6"
        stroke="currentColor"
        strokeWidth={1.67}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function makeRandomSuffix(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const arr = new Uint8Array(length);
    globalThis.crypto.getRandomValues(arr);
    let out = "";
    for (let i = 0; i < length; i++) out += chars[arr[i]! % chars.length]!;
    return out;
  }
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]!;
  return out;
}

type Props = {
  project: ProjectCardData;
  deleteProjectAction: (projectId: string) => Promise<{ error?: string }>;
};

export function ProjectCard({ project, deleteProjectAction }: Props) {
  const href = `/projektuebersicht/${project.id}`;
  const router = useRouter();
  const [deletePending, startDeleteTransition] = useTransition();

  const step1TitleId = useId();
  const step2TitleId = useId();
  const step1DescId = useId();
  const step2DescId = useId();
  const inputId = useId();

  const [deleted, setDeleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [expectedPhrase, setExpectedPhrase] = useState("");
  const [inputValue, setInputValue] = useState("");
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const openDeleteModal = useCallback(() => {
    setDeleteStep(1);
    setExpectedPhrase("");
    setInputValue("");
    setModalOpen(true);
  }, []);

  const goToConfirmStep = useCallback(() => {
    setExpectedPhrase(`NARRAVIT-${makeRandomSuffix(8)}`);
    setInputValue("");
    setDeleteStep(2);
  }, []);

  const backToWarningStep = useCallback(() => {
    setDeleteStep(1);
    setInputValue("");
    setExpectedPhrase("");
  }, []);

  const closeModal = useCallback(() => {
    if (deletePending) return;
    setModalOpen(false);
    setDeleteStep(1);
    setInputValue("");
    setExpectedPhrase("");
  }, [deletePending]);

  const confirmDelete = useCallback(() => {
    if (inputValue.trim() !== expectedPhrase) return;
    setDeleted(true);
    setModalOpen(false);
    startDeleteTransition(async () => {
      const result = await deleteProjectAction(project.id);
      if (result.error) {
        setDeleted(false);
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }, [inputValue, expectedPhrase, deleteProjectAction, project.id, router]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  useEffect(() => {
    if (!modalOpen || deleteStep !== 2) return;
    const frame = requestAnimationFrame(() => { confirmInputRef.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [modalOpen, deleteStep]);

  if (deleted) return null;

  const canConfirm = inputValue.trim() === expectedPhrase && expectedPhrase.length > 0;

  const chapterLabel =
    project.chapterCount === 1 ? "1 Kapitel" : `${project.chapterCount} Kapitel`;

  const modal =
    modalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-5 sm:p-8" role="presentation">
            <button
              type="button"
              className="absolute inset-0 cursor-pointer bg-black/45 transition-opacity"
              aria-label="Dialog schließen"
              onClick={closeModal}
              disabled={deletePending}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={deleteStep === 1 ? step1TitleId : step2TitleId}
              aria-describedby={deleteStep === 1 ? step1DescId : step2DescId}
              className="[font-family:var(--font-lato)] relative z-10 w-full max-w-xl border border-[#e0dcd5] bg-[#FAF8F6] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:max-w-2xl sm:p-10 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed"
            >
              <p className="text-sm font-medium leading-5 text-[#848484] sm:text-base">
                Schritt {deleteStep} von 2
              </p>
              {deleteStep === 1 ? (
                <>
                  <h2 id={step1TitleId} className="[font-family:var(--font-pt-serif)] mt-2 text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
                    Projekt löschen?
                  </h2>
                  <div id={step1DescId} className="mt-5 space-y-4 text-base leading-relaxed text-[#535252] sm:text-lg">
                    <p>
                      Sie sind dabei, das Projekt{" "}
                      <span className="font-semibold text-[#3E3831]">„{project.title}"</span>{" "}
                      <strong className="text-[#3E3831]">unwiderruflich und endgültig</strong> zu
                      entfernen. Alle zugehörigen Inhalte (z.&nbsp;B. Kapitel, Entwürfe und Metadaten)
                      gehen verloren — eine Wiederherstellung ist danach nicht möglich.
                    </p>
                    <p>
                      Im nächsten Schritt erhalten Sie einen{" "}
                      <strong className="text-[#3E3831]">einmaligen Code</strong>, den Sie exakt
                      übernehmen müssen, um das Löschen auszuführen.
                    </p>
                  </div>
                  <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end sm:gap-5">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] sm:w-auto"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={goToConfirmStep}
                      className="min-h-12 w-full bg-[#597083] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#4e6376] sm:w-auto"
                    >
                      Weiter zur Bestätigung
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 id={step2TitleId} className="[font-family:var(--font-pt-serif)] mt-2 text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
                    Bestätigung: Projekt endgültig löschen
                  </h2>
                  <div id={step2DescId} className="mt-5 space-y-4 text-base leading-relaxed text-[#535252] sm:text-lg">
                    <p>
                      Tippen Sie die unten stehende Zeichenkette{" "}
                      <strong className="text-[#3E3831]">exakt</strong> ins Eingabefeld — inklusive
                      Präfix und ohne zusätzliche Leerzeichen. Groß- und Kleinschreibung wird
                      unterschieden.
                    </p>
                  </div>
                  <div className="mt-8 border border-[#e0dcd5] bg-white px-5 py-4">
                    <p className="text-sm font-medium uppercase tracking-wide text-[#848484] sm:text-base">
                      Eingabe erforderlich
                    </p>
                    <p className="mt-3 break-all font-mono text-lg font-semibold tracking-wide text-[#3E3831] sm:text-xl" aria-live="polite">
                      {expectedPhrase}
                    </p>
                  </div>
                  <label htmlFor={inputId} className="mt-6 block text-base font-medium text-[#3E3831]">
                    Bestätigungstext eingeben
                  </label>
                  <input
                    ref={confirmInputRef}
                    id={inputId}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canConfirm && !deletePending) {
                        e.preventDefault();
                        confirmDelete();
                      }
                    }}
                    disabled={deletePending}
                    className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 font-mono text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#848484] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
                    placeholder={expectedPhrase}
                  />
                  <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-5">
                    <button
                      type="button"
                      onClick={backToWarningStep}
                      disabled={deletePending}
                      className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:w-auto"
                    >
                      Zurück
                    </button>
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={deletePending}
                      className="min-h-12 w-full border border-[#e0dcd5] bg-white px-6 py-3.5 text-center text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:w-auto"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      disabled={!canConfirm || deletePending}
                      onClick={confirmDelete}
                      className="min-h-12 w-full bg-[#53444B] px-6 py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {deletePending ? "Wird gelöscht …" : "Endgültig löschen"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {modal}
      <article className="relative flex min-w-0 flex-col bg-white p-5 shadow-none transition-[box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#fcfcfb] hover:shadow-[0_10px_28px_rgba(0,0,0,0.09)] sm:p-8">
        <Link
          href={href}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#96B897]/50"
          aria-label={`Projekt „${project.title}" öffnen`}
        />
        <div className="relative z-10 flex min-h-0 flex-col pointer-events-none">
          <div className="flex flex-row items-start justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-row items-center gap-4">
              <div className="w-14 shrink-0 sm:w-16">
                <CoverRender data={project.coverData} size="card" />
              </div>
              <div className="flex min-w-0 flex-col">
                <h3 className="[font-family:var(--font-pt-serif)] text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-9">
                  {project.title}
                </h3>
                <p className="mt-1 text-base leading-6 text-[#848484]">
                  {project.formattedUpdatedAt}
                </p>
              </div>
            </div>
            {project.userRole === "projektleiter" && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDeleteModal();
                }}
                className="pointer-events-auto relative z-20 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center bg-[#FEF2F2] text-[#DC2626] transition-colors hover:bg-[#FEE2E2] hover:text-[#991B1B]"
                aria-label={`Projekt „${project.title}" löschen`}
              >
                <IconTrash className="pointer-events-none shrink-0" />
              </button>
            )}
          </div>
          <div className="mt-6 flex flex-row flex-wrap items-center justify-between gap-3 border-t border-transparent pt-4 sm:mt-8 sm:pt-4">
            <p className="text-base leading-6 text-[#848484] sm:text-lg">{chapterLabel}</p>
            <Link
              href={href}
              tabIndex={-1}
              className="pointer-events-auto relative z-20 inline-flex min-h-12 min-w-[6rem] items-center justify-center bg-[#D0BCA6] px-5 py-2 text-lg font-bold leading-6 text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
            >
              Öffnen
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
