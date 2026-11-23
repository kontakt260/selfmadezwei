"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookView } from "@/components/cover/BookView";
import { Button } from "@/components/ui/button";
import type { CoverData } from "@/lib/cover-types";
import type { ProjectCardAccess } from "@/lib/projects/project-card-status";

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
  // PROJ-22: bestimmt Statuszeile und Button der Karte.
  access: ProjectCardAccess;
};

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
  /** PROJ-22: große Karte, wenn die Person genau ein Projekt hat. */
  featured?: boolean;
};

function primaryActionLabel(project: ProjectCardData): string {
  if (project.access.state === "expired") return "Ansehen";
  if (project.access.state === "unknown") return "Öffnen";
  return project.chapterCount === 0 ? "Loslegen" : "Weiterschreiben";
}

export function ProjectCard({ project, deleteProjectAction, featured = false }: Props) {
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
    project.chapterCount === 0
      ? "Noch keine Kapitel"
      : project.chapterCount === 1
        ? "1 Kapitel"
        : `${project.chapterCount} Kapitel`;
  const canDelete = project.userRole === "projektleiter";
  const roleLabel = canDelete ? "Sie leiten dieses Buch" : "Sie schreiben mit";
  const expired = project.access.state === "expired";
  const Heading = featured ? "h2" : "h3";

  const modal =
    modalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[300] flex overflow-y-auto p-5 sm:p-8" role="presentation">
            <button
              type="button"
              className="fixed inset-0 cursor-pointer bg-black/45 transition-opacity"
              aria-label="Dialog schließen"
              onClick={closeModal}
              disabled={deletePending}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={deleteStep === 1 ? step1TitleId : step2TitleId}
              aria-describedby={deleteStep === 1 ? step1DescId : step2DescId}
              className="[font-family:var(--font-lato)] relative z-10 m-auto w-full max-w-xl border border-[#e0dcd5] bg-[#FAF8F6] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:max-w-2xl sm:p-10 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed"
            >
              <p className="text-base font-medium leading-6 text-[#5F5A54]">
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
                      <span className="font-semibold text-[#3E3831]">„{project.title}&quot;</span>{" "}
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
                    <p className="text-base font-medium uppercase tracking-wide text-[#5F5A54]">
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
                    className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 font-mono text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#6B655E] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
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
      <article
        className={`relative flex min-w-0 border border-[#E0DCD5] bg-white transition-colors hover:border-[#BDB5AA] ${
          featured
            ? "flex-col shadow-[0_24px_60px_rgba(43,39,34,0.28)] md:flex-row"
            : "flex-col shadow-[0_10px_28px_rgba(43,39,34,0.12)]"
        }`}
      >
        <Link
          href={href}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#3E3831]"
          aria-label={`Projekt „${project.title}" öffnen`}
        />
        <div
          className={`pointer-events-none relative z-10 flex items-center justify-center bg-[#EFEAE3] ${
            featured ? "px-6 py-10 md:flex-1 md:px-8 md:py-11" : "px-6 py-8"
          }`}
        >
          <BookView
            data={project.coverData}
            className={featured ? "max-w-[300px]" : "max-w-[222px]"}
          />
        </div>
        <div
          className={`pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col ${
            featured ? "justify-center gap-5 p-6 sm:p-8 md:p-12" : "gap-3.5 p-6"
          }`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-lg leading-7 text-[#5F5A54]">
              {featured ? "Ihr Projekt" : roleLabel}
            </p>
            <Heading
              className={`[overflow-wrap:anywhere] text-[#3E3831] ${
                featured
                  ? "text-[2rem] leading-[1.15] sm:text-[2.625rem]"
                  : "text-[1.75rem] leading-[1.22]"
              }`}
            >
              {project.title}
            </Heading>
          </div>
          <div
            className={`flex flex-col gap-0.5 leading-normal text-[#4A453F] ${
              featured ? "text-xl" : "text-[1.1875rem]"
            }`}
          >
            <p>{chapterLabel}</p>
            {project.access.state === "expired" ? (
              <p className="font-bold text-[#8A3B12]">
                Abgelaufen am {project.access.expiredOn}
              </p>
            ) : (
              <p>{project.formattedUpdatedAt}</p>
            )}
          </div>
          <Button
            asChild
            className={`pointer-events-auto relative z-20 h-14 w-full px-5 text-[1.1875rem] font-bold ${
              featured ? "" : "mt-auto"
            } ${
              expired
                ? "border-[#EFEBE5] bg-[#EFEBE5] text-[#1F1C19] hover:border-[#E4DFD8] hover:bg-[#E4DFD8]"
                : ""
            }`}
          >
            <Link href={href} tabIndex={-1}>
              {primaryActionLabel(project)}
            </Link>
          </Button>
          {(canDelete || !featured) && (
            <div className="flex min-h-11 items-center">
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDeleteModal();
                  }}
                  className="pointer-events-auto relative z-20 min-h-11 cursor-pointer text-[1.0625rem] text-[#5F5A54] underline underline-offset-4 transition-colors hover:text-[#3E3831]"
                  aria-label={`Projekt „${project.title}" löschen`}
                >
                  Projekt löschen
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    </>
  );
}
