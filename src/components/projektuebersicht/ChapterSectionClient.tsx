"use client";

import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type Chapter, reorderChapters } from "@/lib/projektuebersicht-chapters";
import type { ErzaehlImpuls } from "@/lib/projektuebersicht-erzaehl-impulse";

const DELETE_CONFIRM_SECONDS = 3;

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconDrag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx={9} cy={6} r={1.4} fill="#B5B5B5" />
      <circle cx={9} cy={12} r={1.4} fill="#B5B5B5" />
      <circle cx={9} cy={18} r={1.4} fill="#B5B5B5" />
      <circle cx={15} cy={6} r={1.4} fill="#B5B5B5" />
      <circle cx={15} cy={12} r={1.4} fill="#B5B5B5" />
      <circle cx={15} cy={18} r={1.4} fill="#B5B5B5" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 21h4l11-11-4-4L3 17v4ZM14 6l4 4" stroke="currentColor" strokeWidth={1.67} strokeLinecap="square" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth={1.67} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

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

function ShuffleIconAttached({ className }: { className?: string }) {
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

// ─── Server Action Types ──────────────────────────────────────────────────────

type AddChapterAction = (formData: FormData) => Promise<{ chapterId?: string; error?: string }>;
type RenameChapterAction = (formData: FormData) => Promise<{ error?: string }>;
type DeleteChapterAction = (formData: FormData) => Promise<{ error?: string }>;
type SaveChapterOrderAction = (formData: FormData) => Promise<{ error?: string }>;
type AddImpulseChapterAction = (formData: FormData) => Promise<{ chapterId?: string; error?: string }>;

type Props = {
  projectId: string;
  initialChapters: Chapter[];
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

export function ChapterSectionClient({
  projectId,
  initialChapters,
  impulses,
  addChapterAction,
  addImpulseChapterAction,
  renameChapterAction,
  deleteChapterAction,
  saveChapterOrderAction,
}: Props) {
  const router = useRouter();

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>(() =>
    initialChapters.map((c) => c.id),
  );

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Modal state
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(DELETE_CONFIRM_SECONDS);
  const [editTarget, setEditTarget] = useState<Chapter | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addTitleValue, setAddTitleValue] = useState("");
  const [impulseOpen, setImpulseOpen] = useState(false);
  const [impulseIndex, setImpulseIndex] = useState(0);

  // Pending transitions
  const [addPending, startAddTransition] = useTransition();
  const [impulseAddPending, startImpulseAddTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [orderPending, startOrderTransition] = useTransition();

  const titleId = useId();
  const descId = useId();
  const countdownId = useId();
  const editTitleId = useId();
  const editDescId = useId();
  const editInputId = useId();
  const editInputRef = useRef<HTMLInputElement>(null);
  const addTitleId = useId();
  const addDescId = useId();
  const addInputId = useId();
  const addInputRef = useRef<HTMLInputElement>(null);
  const impulseDialogTitleId = useId();
  const impulseDialogDescId = useId();

  const chapterOrderDirty = useMemo(() => {
    if (chapters.length !== savedOrderIds.length) return true;
    return chapters.some((c, i) => c.id !== savedOrderIds[i]);
  }, [chapters, savedOrderIds]);

  // ─── Order ───────────────────────────────────────────────────────────────

  const commitChapterOrder = useCallback(() => {
    const orderedIds = chapters.map((c) => c.id);
    setSavedOrderIds(orderedIds);
    startOrderTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("orderedIds", JSON.stringify(orderedIds));
      const result = await saveChapterOrderAction(fd);
      if (result.error) {
        toast.error(result.error);
        setSavedOrderIds((prev) => prev);
      } else {
        router.refresh();
      }
    });
  }, [chapters, projectId, saveChapterOrderAction, router]);

  // ─── Delete chapter modal ─────────────────────────────────────────────────

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
  }, []);

  const openDeleteModal = useCallback((chapter: Chapter) => {
    setEditTarget(null);
    setEditTitleValue("");
    setAddOpen(false);
    setAddTitleValue("");
    setImpulseOpen(false);
    setDeleteTarget(chapter);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
  }, []);

  const confirmChapterDelete = useCallback(() => {
    if (!deleteTarget || deleteCountdown > 0) return;
    const targetId = deleteTarget.id;
    setChapters((prev) => {
      const next = prev.filter((c) => c.id !== targetId);
      queueMicrotask(() => setSavedOrderIds(next.map((c) => c.id)));
      return next;
    });
    closeDeleteModal();
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.set("chapterId", targetId);
      fd.set("projectId", projectId);
      const result = await deleteChapterAction(fd);
      if (result.error) {
        toast.error(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }, [deleteTarget, deleteCountdown, closeDeleteModal, deleteChapterAction, projectId, router]);

  const canConfirmDelete = deleteTarget !== null && deleteCountdown === 0 && !deletePending;

  // ─── Rename chapter modal ─────────────────────────────────────────────────

  const closeEditModal = useCallback(() => {
    setEditTarget(null);
    setEditTitleValue("");
  }, []);

  const openEditModal = useCallback((chapter: Chapter) => {
    setDeleteTarget(null);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setAddOpen(false);
    setAddTitleValue("");
    setImpulseOpen(false);
    setEditTarget(chapter);
    setEditTitleValue(chapter.title);
  }, []);

  const saveChapterTitle = useCallback(() => {
    if (!editTarget) return;
    const next = editTitleValue.trim();
    if (!next) return;
    const targetId = editTarget.id;
    setChapters((prev) => prev.map((c) => (c.id === targetId ? { ...c, title: next } : c)));
    closeEditModal();
    startRenameTransition(async () => {
      const fd = new FormData();
      fd.set("chapterId", targetId);
      fd.set("title", next);
      fd.set("projectId", projectId);
      const result = await renameChapterAction(fd);
      if (result.error) {
        toast.error(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }, [editTarget, editTitleValue, closeEditModal, renameChapterAction, projectId, router]);

  const canSaveChapterTitle = editTitleValue.trim().length > 0;

  // ─── Add own chapter modal ────────────────────────────────────────────────

  const closeAddModal = useCallback(() => {
    setAddOpen(false);
    setAddTitleValue("");
  }, []);

  const openAddModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setEditTarget(null);
    setEditTitleValue("");
    setAddTitleValue("");
    setImpulseOpen(false);
    setAddOpen(true);
  }, []);

  const canConfirmAddChapter = addTitleValue.trim().length > 0 && !addPending;

  const confirmAddChapter = useCallback(() => {
    const title = addTitleValue.trim();
    if (!title) return;
    closeAddModal();
    startAddTransition(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("projectId", projectId);
      const result = await addChapterAction(fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.chapterId) {
        router.push(`/projektuebersicht/${projectId}/kapiteleditor/${result.chapterId}`);
      }
    });
  }, [addTitleValue, closeAddModal, addChapterAction, projectId, router]);

  // ─── Erzähl-Impuls modal ──────────────────────────────────────────────────

  const closeImpulseModal = useCallback(() => {
    setImpulseOpen(false);
  }, []);

  const openErzaehlImpulsModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setEditTarget(null);
    setEditTitleValue("");
    setAddOpen(false);
    setAddTitleValue("");
    const len = impulses.length;
    setImpulseIndex(len > 0 ? Math.floor(Math.random() * len) : 0);
    setImpulseOpen(true);
  }, [impulses.length]);

  const shuffleImpulse = useCallback(() => {
    setImpulseIndex((prev) => {
      const len = impulses.length;
      if (len <= 1) return 0;
      let next = Math.floor(Math.random() * len);
      let guard = 0;
      while (next === prev && guard < 16) {
        next = Math.floor(Math.random() * len);
        guard += 1;
      }
      return next;
    });
  }, [impulses.length]);

  const currentImpulse = impulses[impulseIndex];
  const currentImpulseTitle = currentImpulse?.title ?? "";
  const currentImpulseCategory = currentImpulse?.category ?? "";
  const currentImpulsePreviewQuestion = currentImpulse?.leading_questions[0] ?? "";
  const currentImpulseId = currentImpulse?.id ?? "";

  const confirmErzaehlImpulse = useCallback(() => {
    const title = currentImpulseTitle.trim();
    if (!title) return;
    const tempId = `optimistic-${Date.now()}`;
    const optimisticChapter: Chapter = { id: tempId, title, source: "Erzähl-Impuls", words: 0 };
    setChapters((prev) => {
      const next = [...prev, optimisticChapter];
      queueMicrotask(() => setSavedOrderIds(next.map((c) => c.id)));
      return next;
    });
    closeImpulseModal();
    startImpulseAddTransition(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("projectId", projectId);
      // PROJ-8: impulse_id für Server-Action — /backend nutzt sie, um
      // chapters.source_impulse_id korrekt zu setzen (statt hardcoded NULL).
      // Frontend-Phase: der Wert ist der Mock-Slug; /backend ersetzt durch
      // echte UUID nach der DB-Migration.
      if (currentImpulseId) fd.set("impulseId", currentImpulseId);
      const result = await addImpulseChapterAction(fd);
      if (result.error) {
        toast.error(result.error);
        setChapters((prev) => {
          const next = prev.filter((c) => c.id !== tempId);
          queueMicrotask(() => setSavedOrderIds(next.map((c) => c.id)));
          return next;
        });
        return;
      }
      // Optimistische ID durch die echte chapter.id aus dem Server-Insert
      // ersetzen (Bug 2026-05-21: sonst zeigt der „Bearbeiten"-Link auf
      // /kapiteleditor/optimistic-<ts> → 404, weil die optimistische ID
      // niemals in der DB existiert).
      const realId = result.chapterId;
      if (realId) {
        setChapters((prev) => {
          const next = prev.map((c) =>
            c.id === tempId ? { ...c, id: realId } : c,
          );
          queueMicrotask(() => setSavedOrderIds(next.map((c) => c.id)));
          return next;
        });
      }
      router.refresh();
    });
  }, [currentImpulseTitle, currentImpulseId, closeImpulseModal, addImpulseChapterAction, projectId, router]);

  // ─── Drag and Drop ────────────────────────────────────────────────────────

  const onDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );
  const onDragEnd = useCallback(() => { setDragIndex(null); setOverIndex(null); }, []);
  const onDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverIndex(index);
    },
    [],
  );
  const onDragLeave = useCallback(() => setOverIndex(null), []);
  const onDrop = useCallback(
    (toIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const from = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (Number.isNaN(from)) return;
      setChapters((prev) => reorderChapters(prev, from, toIndex));
      setDragIndex(null);
      setOverIndex(null);
    },
    [],
  );

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!deleteTarget) return;
    const id = window.setInterval(() => {
      setDeleteCountdown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [deleteTarget?.id]);

  useEffect(() => {
    if (!deleteTarget && !editTarget && !addOpen && !impulseOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [deleteTarget, editTarget, addOpen, impulseOpen]);

  useEffect(() => {
    if (!deleteTarget && !editTarget && !addOpen && !impulseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (impulseOpen) closeImpulseModal();
      else if (addOpen) closeAddModal();
      else if (editTarget) closeEditModal();
      else closeDeleteModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, editTarget, addOpen, impulseOpen, closeDeleteModal, closeEditModal, closeAddModal, closeImpulseModal]);

  useEffect(() => {
    if (!editTarget) return;
    const frame = requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editTarget?.id]);

  useEffect(() => {
    if (!addOpen) return;
    const frame = requestAnimationFrame(() => { addInputRef.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [addOpen]);

  // ─── Modals ───────────────────────────────────────────────────────────────

  const modalShell = (content: React.ReactNode) =>
    typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-5 sm:p-8" role="presentation">
            <button
              type="button"
              className="absolute inset-0 cursor-pointer bg-black/45 transition-opacity"
              aria-label="Dialog schließen"
              onClick={() => {
                if (impulseOpen) closeImpulseModal();
                else if (addOpen) closeAddModal();
                else if (editTarget) closeEditModal();
                else closeDeleteModal();
              }}
            />
            <div className="[font-family:var(--font-lato)] relative z-10 w-full max-w-xl border border-[#e0dcd5] bg-[#FAF8F6] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:max-w-2xl sm:p-10 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
              {content}
            </div>
          </div>,
          document.body,
        )
      : null;

  const deleteModal = deleteTarget
    ? modalShell(
        <>
          <h2 id={titleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
            Kapitel „{deleteTarget.title}" löschen?
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
        </>,
      )
    : null;

  const editModal = editTarget
    ? modalShell(
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
            className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#848484] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
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
        </>,
      )
    : null;

  const addModal = addOpen
    ? modalShell(
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
            className="mt-3 w-full border border-[#e0dcd5] bg-white px-4 py-3.5 text-base text-[#3E3831] outline-none transition-colors placeholder:text-[#848484] focus:border-[#96B897] disabled:opacity-50 sm:text-lg"
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
        </>,
      )
    : null;

  const impulseModal = impulseOpen
    ? modalShell(
        <>
          <h2 id={impulseDialogTitleId} className="[font-family:var(--font-pt-serif)] text-2xl leading-9 text-[#3E3831] sm:text-3xl sm:leading-10">
            Erzähl-Impuls wählen
          </h2>
          <p id={impulseDialogDescId} className="mt-5 text-base leading-relaxed text-[#535252] sm:text-lg">
            Mischen Sie durch Vorschläge, bis ein Thema passt — dann übernehmen Sie es als neues Kapitel.
          </p>
          <div className="mt-8 border border-[#e0dcd5] bg-white px-5 py-6 sm:px-6 sm:py-8" aria-live="polite" aria-atomic="true">
            {currentImpulseCategory && (
              <p className="[font-family:var(--font-lato)] text-xs font-semibold uppercase tracking-wide text-[#848484] sm:text-sm">
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
        </>,
      )
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {deleteModal}
      {editModal}
      {addModal}
      {impulseModal}
      <SectionHeader
        icon={<IconBook />}
        title="Kapitel"
        actions={
          <>
            {chapterOrderDirty ? (
              <button
                type="button"
                onClick={commitChapterOrder}
                disabled={orderPending}
                className="inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center gap-2 border border-[#96B897] bg-[#EAF0EA] px-4 text-base font-bold leading-6 text-[#3E5A40] transition-colors hover:bg-[#dfe9df] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-lg"
              >
                {orderPending ? "Wird gespeichert …" : "Reihenfolge speichern"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 sm:w-auto sm:text-lg"
            >
              <IconPlus color="#534B42" />
              Eigenes Kapitel
            </button>
            <button
              type="button"
              onClick={openErzaehlImpulsModal}
              className="inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#D0BCA6] px-4 text-base font-bold leading-6 text-[#0a0909] transition-colors hover:bg-[#c0ad98] sm:w-auto sm:text-lg"
            >
              <IconPlus color="#0a0909" />
              Erzähl-Impuls
            </button>
          </>
        }
      />
      {chapters.length === 0 ? (
        <div className="flex flex-col items-center gap-5 py-12 text-center sm:py-14">
          <p className="text-lg leading-8 text-[#848484] sm:text-xl sm:leading-9">
            Noch keine Kapitel vorhanden.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-12 min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#0A0909]/5 px-5 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 sm:text-lg"
            >
              <IconPlus color="#534B42" />
              Eigenes Kapitel
            </button>
            <button
              type="button"
              onClick={openErzaehlImpulsModal}
              className="inline-flex h-12 min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#D0BCA6] px-5 text-base font-bold leading-6 text-[#0a0909] transition-colors hover:bg-[#c0ad98] sm:text-lg"
            >
              <IconPlus color="#0a0909" />
              Erzähl-Impuls
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5" role="list" aria-label="Kapitelreihenfolge">
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              role="listitem"
              onDragOver={onDragOver(index)}
              onDragLeave={onDragLeave}
              onDrop={onDrop(index)}
              className={`flex flex-col gap-4 border border-transparent bg-[#FAF8F6] p-5 py-5 transition-[opacity,box-shadow] sm:min-h-[6rem] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-7 ${
                dragIndex === index ? "opacity-60" : ""
              } ${
                overIndex === index && dragIndex !== null && dragIndex !== index
                  ? "shadow-[inset_0_0_0_2px_#96B897]"
                  : ""
              }`}
            >
              <div
                draggable
                onDragStart={onDragStart(index)}
                onDragEnd={onDragEnd}
                className="flex min-w-0 flex-1 cursor-grab flex-row items-center gap-3 sm:gap-4 active:cursor-grabbing"
                aria-grabbed={dragIndex === index}
                aria-label={`Kapitel ${index + 1}: ${chapter.title} — zum Umsortieren ziehen`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#B5B5B5] sm:h-7 sm:w-7">
                  <IconDrag className="h-full w-full" />
                </span>
                <span className="w-8 shrink-0 text-lg leading-7 text-[#B5B5B5] sm:w-9 sm:text-xl sm:leading-8">
                  {index + 1}.
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h4 className="[font-family:var(--font-pt-serif)] line-clamp-2 text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-9">
                    {chapter.title}
                  </h4>
                  <p className="text-sm leading-6 text-[#848484] sm:text-base">
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
                  className="relative z-20 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center bg-[#EAF0EA] text-[#3E3831] transition-colors hover:bg-[#dfe9df] hover:text-[#2d332d] sm:h-8 sm:w-8"
                  aria-label={`Kapitel „${chapter.title}" umbenennen`}
                >
                  <IconPencil className="pointer-events-none h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                </button>
                <button
                  type="button"
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                  onClick={() => openDeleteModal(chapter)}
                  className="relative z-20 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center bg-[#FEF2F2] text-[#DC2626] transition-colors hover:bg-[#FEE2E2] hover:text-[#991B1B] sm:h-8 sm:w-8"
                  aria-label={`Kapitel „${chapter.title}" löschen`}
                >
                  <IconTrash className="pointer-events-none h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
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
                  <Link
                    href={`/projektuebersicht/${projectId}/kapiteleditor/${chapter.id}`}
                    draggable={false}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className="relative z-20 inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 sm:w-auto sm:text-lg"
                  >
                    Bearbeiten
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
