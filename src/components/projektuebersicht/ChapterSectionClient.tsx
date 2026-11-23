"use client";

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
import { ReadOnlyScope } from "@/components/ReadOnlyScope";
import { type Chapter, reorderChapters } from "@/lib/projektuebersicht-chapters";
import {
  addChapterContent,
  chapterRow,
  deleteChapterContent,
  IconBook,
  IconPlus,
  impulseChapterContent,
  renameChapterContent,
  SectionHeader,
} from "./chapter-section-parts";
import { type Props } from "./chapter-section-types";

const DELETE_CONFIRM_SECONDS = 3;

export function ChapterSectionClient({
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
  const router = useRouter();

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>(() =>
    initialChapters.map((c) => c.id),
  );

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // PROJ-30: Neuer Stand vom Server (Wortzahl, Titel, Reihenfolge) wird
  // übernommen, zum Beispiel nach der Zurück-Taste. Nur nicht mitten im Ziehen.
  const serverVersion = initialChapters
    .map((chapter) => `${chapter.id}|${chapter.title}|${chapter.words}`)
    .join("\n");
  const [appliedVersion, setAppliedVersion] = useState(serverVersion);
  if (serverVersion !== appliedVersion && dragIndex === null) {
    setAppliedVersion(serverVersion);
    setChapters(initialChapters);
    setSavedOrderIds(initialChapters.map((chapter) => chapter.id));
  }

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
    const previousOrderIds = savedOrderIds;
    setSavedOrderIds(orderedIds);
    startOrderTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("orderedIds", JSON.stringify(orderedIds));
      const result = await saveChapterOrderAction(fd);
      if (result.error) {
        toast.error(result.error);
        setSavedOrderIds(previousOrderIds);
      }
      router.refresh();
    });
  }, [chapters, savedOrderIds, projectId, saveChapterOrderAction, router]);

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

  // Nur die ID als Abhängigkeit: Countdown und Fokus sollen pro geöffnetem
  // Ziel einmal starten, nicht bei jeder neuen Objekt-Identität.
  const deleteTargetId = deleteTarget?.id;
  const editTargetId = editTarget?.id;

  useEffect(() => {
    if (!deleteTargetId) return;
    const id = window.setInterval(() => {
      setDeleteCountdown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [deleteTargetId]);

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
    if (!editTargetId) return;
    const frame = requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editTargetId]);

  useEffect(() => {
    if (!addOpen) return;
    const frame = requestAnimationFrame(() => { addInputRef.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [addOpen]);

  // ─── Modals ───────────────────────────────────────────────────────────────

  const modalShell = (content: React.ReactNode) =>
    typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[300] flex overflow-y-auto p-5 sm:p-8" role="presentation">
            <button
              type="button"
              className="fixed inset-0 cursor-pointer bg-black/45 transition-opacity"
              aria-label="Dialog schließen"
              onClick={() => {
                if (impulseOpen) closeImpulseModal();
                else if (addOpen) closeAddModal();
                else if (editTarget) closeEditModal();
                else closeDeleteModal();
              }}
            />
            <div className="[font-family:var(--font-lato)] relative z-10 m-auto w-full max-w-xl border border-[#e0dcd5] bg-[#FAF8F6] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:max-w-2xl sm:p-10 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
              {content}
            </div>
          </div>,
          document.body,
        )
      : null;

  const deleteModal = deleteTarget
    ? modalShell(
        deleteChapterContent(
          deleteTarget, titleId, descId, countdownId, deleteCountdown, closeDeleteModal, canConfirmDelete, confirmChapterDelete, deletePending,
        ),
      )
    : null;

  const editModal = editTarget
    ? modalShell(
        renameChapterContent(
          // eslint-disable-next-line react-hooks/refs -- Der Ref wird dort nur als JSX-Attribut gesetzt, nicht gelesen.
          editTitleId, editDescId, editInputId, editInputRef, editTitleValue, setEditTitleValue, canSaveChapterTitle, renamePending, saveChapterTitle, closeEditModal,
        ),
      )
    : null;

  const addModal = addOpen
    ? modalShell(
        addChapterContent(
          // eslint-disable-next-line react-hooks/refs -- Der Ref wird dort nur als JSX-Attribut gesetzt, nicht gelesen.
          addTitleId, addDescId, addInputId, addInputRef, addTitleValue, setAddTitleValue, canConfirmAddChapter, addPending, confirmAddChapter, closeAddModal,
        ),
      )
    : null;

  const impulseModal = impulseOpen
    ? modalShell(
        impulseChapterContent(
          impulseDialogTitleId, impulseDialogDescId, currentImpulseCategory, currentImpulseTitle, currentImpulsePreviewQuestion, shuffleImpulse, closeImpulseModal, confirmErzaehlImpulse, impulseAddPending,
        ),
      )
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {deleteModal}
      {editModal}
      {addModal}
      {impulseModal}
      <ReadOnlyScope readOnly={readOnly}>
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
              Erzähl-Impulse ansehen
            </button>
          </>
        }
      />
      {chapters.length === 0 ? (
        <div className="flex flex-col items-center gap-5 py-12 text-center sm:py-14">
          <p className="text-lg leading-8 text-[#5F5A54] sm:text-xl sm:leading-9">
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
              Erzähl-Impulse ansehen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5" role="list" aria-label="Kapitelreihenfolge">
          {chapters.map((chapter, index) =>
            chapterRow(
              chapter, index, projectId, readOnly, dragIndex, overIndex, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, openEditModal, openDeleteModal,
            ),
          )}
        </div>
      )}
      </ReadOnlyScope>
    </>
  );
}
