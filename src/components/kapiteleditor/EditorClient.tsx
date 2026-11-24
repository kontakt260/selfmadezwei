"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import { ArrowLeft, Pencil } from "lucide-react";
import { editorExtensions } from "./tiptap/extensions";
import { HYPHENATION_META } from "./tiptap/Hyphenation";
import { placeCaretNearPoint } from "./tiptap/caretPlacement";
import { EditorToolbar } from "./EditorToolbar";
import { EditorLoadingScreen } from "@/components/loading/LoadingViews";
import { FirstPageHeader } from "./FirstPageTemplate";
import { ImageSectionsProvider, type ImageSectionsApi } from "./ImageSectionsContext";
import { ImageUploadDialog, type UploadedImage } from "./ImageUploadDialog";
import { createLinkRefresher, type FreshLinks, type LinkRefresher } from "./freshImageLinks";
import type { SectionRemovalRequest } from "./tiptap/ImageSectionNode";
import { SaveStatus } from "./SaveStatus";
import { WordCount } from "./WordCount";
import { ImpulseHintBanner } from "./ImpulseHintBanner";
import { ZoomControl, DEFAULT_ZOOM, type ZoomLevel } from "./ZoomControl";
import { useHistoryRefreshPending } from "@/components/HistoryFreshness";
import { useAutoSave } from "@/hooks/useAutoSave";
import { trackSave } from "@/lib/pending-saves";
import { countWordsFromBody } from "@/lib/kapiteleditor/countWords";
import { planChapterSave, type SavedChapterState } from "@/lib/kapiteleditor/save-plan";
import {
  MAX_IMAGES_PER_CHAPTER,
  MAX_IMAGES_PER_SECTION,
  allImages,
  collectImageSectionIds,
  getImageSection,
  isInProjectFolder,
  withImageSection,
} from "@/lib/kapiteleditor/image-sections";
import {
  EMPTY_IMAGE_SECTIONS,
  type ChapterDraft,
  type ChapterImage,
  type ImageSectionData,
  type ImageSections,
} from "@/lib/kapiteleditor/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  chapterAutosaveAction,
  chapterPageCountAction,
  chapterImageUploadPrepareAction,
  chapterImageUploadCommitAction,
  chapterImageDeleteAction,
  chapterImageLinksAction,
} from "@/app/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]/actions";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { usePagination } from "./usePagination";
import { keepCursorInView } from "./keepCursorInView";

type Props = {
  projectId: string;
  chapterId: string;
  initialTitle: string;
  initialBody: unknown;
  initialImageSections: ImageSections;
  // PROJ-7: Buch-Offset, an dem dieses Kapitel beginnt (1-indexed).
  // Vom Server beim Laden geliefert; bleibt während der Editor-Session
  // konstant (kein Realtime-Push aus anderen Tabs — Spec-Entscheidung).
  initialStartPage: number;
  // PROJ-30: gespeicherte Seitenzahl. Nur wenn die Pagination davon abweicht,
  // wird nach dem Öffnen etwas geschrieben.
  initialPageCount: number;
  // PROJ-8: optionaler Impuls für das Banner. Null wenn das Kapitel
  // keinen source_impulse_id hat ODER der referenzierte Impuls nicht
  // mehr existiert. Frontend-Phase reicht null durch (kein DB-Lookup);
  // /backend befüllt es nach der Schema-Migration.
  initialImpulse: { title: string; leadingQuestions: readonly string[] } | null;
  // PROJ-28: Zugang abgelaufen. Das Kapitel bleibt sichtbar, aber nichts
  // lässt sich ändern und es wird nichts gespeichert.
  readOnly?: boolean;
};

export function EditorClient({
  projectId,
  chapterId,
  initialTitle,
  initialBody,
  initialImageSections,
  initialStartPage,
  initialPageCount,
  initialImpulse,
  readOnly = false,
}: Props) {
  // PROJ-30: Nach Zurück oder Vorwärts kann der geladene Text veraltet sein.
  // Bis der aktuelle Stand da ist, ist keine Eingabe und kein Speichern möglich.
  const historyRefreshPending = useHistoryRefreshPending();
  const inputLocked = readOnly || historyRefreshPending;
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState<unknown>(initialBody);
  const [imageSections, setImageSections] = useState<ImageSections>(
    initialImageSections ?? EMPTY_IMAGE_SECTIONS,
  );
  const [zoom, setZoom] = useState<ZoomLevel>(DEFAULT_ZOOM);
  // Lade-Animation (User-Anforderung 2026-05-21): während der Editor
  // initial mountet + die ersten Pagination-Settling-Passes laufen,
  // wird der Content visuell zerstückelt sichtbar (Text erst ungelayouted,
  // dann Image-Scales springen, HRs settlen). Wir blenden den Editor-
  // Stack solange aus, bis Layout + Image-Loads beruhigt sind, und
  // fadeen ihn DANN in einem Schwung ein.
  const [editorReady, setEditorReady] = useState(false);
  // PROJ-30: Der Inhalt erscheint, sobald das Layout ruhig ist. `editorReady`
  // wartet weiter die langen Settling-Passes ab, bevor die Seitenzahl zählt.
  const [contentVisible, setContentVisible] = useState(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialBody ?? undefined,
    editable: !inputLocked,
    editorProps: EDITOR_PROPS,
    onUpdate: ({ editor, transaction }) => {
      // PROJ-30: Silbentrennung beim Öffnen ändert den Text der Person nicht.
      if (transaction.getMeta(HYPHENATION_META)) return;
      setBody(editor.getJSON());
      keepCursorInView(editor);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    editor?.setEditable(!inputLocked, false);
  }, [editor, inputLocked]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      allImages(imageSections).forEach((img) => {
        if (img.signed_url.startsWith("blob:")) URL.revokeObjectURL(img.signed_url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wordCount = useMemo(() => countWordsFromBody(body), [body]);

  const stackRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);

  const { pageCount } = usePagination({
    editor,
    stackRef,
    fgRef,
    imageSectionsDeps: imageSections,
    titleDep: title,
    initialPageCount,
  });

  // PROJ-25: Beim Zoomen bleibt die aktuelle Stelle im Blick. Die Seiten werden
  // höher oder niedriger, bei gleicher Scroll-Position stünde sonst plötzlich
  // eine andere Stelle auf dem Bildschirm. Fixpunkt ist der Cursor, wenn er
  // sichtbar ist, sonst die Bildschirmmitte.
  const zoomAnchorRef = useRef<{ screenY: number; pageY: number } | null>(null);
  const changeZoom = (next: ZoomLevel) => {
    const stack = stackRef.current;
    if (stack) {
      let screenY = window.innerHeight / 2;
      try {
        if (editor) {
          const caretTop = editor.view.coordsAtPos(editor.state.selection.head).top;
          if (caretTop >= 0 && caretTop <= window.innerHeight) screenY = caretTop;
        }
      } catch {
        // coordsAtPos kann werfen, solange das DOM nicht synchron ist.
      }
      zoomAnchorRef.current = { screenY, pageY: (screenY - stack.getBoundingClientRect().top) / zoom };
    }
    setZoom(next);
  };
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const stack = stackRef.current;
    zoomAnchorRef.current = null;
    if (!anchor || !stack) return;
    const target = stack.getBoundingClientRect().top + anchor.pageY * zoom;
    window.scrollBy({ top: target - anchor.screenY, behavior: "instant" });
  }, [zoom]);

  // PROJ-7: Buch-Offset bleibt während der Editor-Session konstant
  // (siehe Tech-Design Sektion C — kein Realtime-Push aus anderen Tabs).
  const startPage = initialStartPage;

  // PROJ-7: pageCount ist Teil des Auto-Save-Drafts — beim ersten Settle
  // schreibt der Server den realen Wert in chapters.page_count und der
  // DB-Trigger rechnet start_page der Folge-Kapitel neu.
  const draft: ChapterDraft = useMemo(
    () => ({
      title,
      body,
      imageSections,
      colorPageCount: estimateColorPages(imageSections, body),
      // Erst melden, wenn die Pagination eingeschwungen ist. Während des
      // Ladens läuft pageCount über Zwischenwerte (1 → … → Endwert); ein
      // Speichern in diesem Moment — etwa der Flush beim sofortigen
      // Verlassen der Seite — würde einen falschen page_count festschreiben.
      pageCount: editorReady ? pageCount : undefined,
    }),
    [title, body, imageSections, pageCount, editorReady],
  );

  // PROJ-30: Stand, den der Server sicher kennt. Text, Titel und Bilder gehen
  // nur zum Server, wenn sie sich davon unterscheiden.
  const lastSavedRef = useRef<SavedChapterState>({
    title: initialTitle,
    body: initialBody,
    imageSections,
    pageCount: initialPageCount,
  });

  const saveDraft = useCallback(
    async (d: ChapterDraft): Promise<void> => {
      const plan = planChapterSave(d, lastSavedRef.current);
      if (plan === "none") return;
      if (plan === "page-count" && d.pageCount !== undefined) {
        const pageCount = d.pageCount;
        const res = await trackSave(chapterPageCountAction({ projectId, chapterId, pageCount }));
        if (res.error) throw new Error(res.error);
        lastSavedRef.current = { ...lastSavedRef.current, pageCount };
        return;
      }
      const res = await trackSave(
        chapterAutosaveAction({
          projectId,
          chapterId,
          title: d.title,
          // PROJ-34: ProseMirror legt Attribute als Objekte ohne Prototyp an.
          // Next.js überträgt solche Objekte nicht an den Server, Zeilenabstand,
          // Einzug, Ausrichtung und Bildabschnitte gingen so verloren.
          body: toPlainJson(d.body),
          imageSections: d.imageSections,
          colorPageCount: d.colorPageCount,
          pageCount: d.pageCount,
        }),
      );
      if (res.error) throw new Error(res.error);
      lastSavedRef.current = {
        title: d.title,
        body: d.body,
        imageSections: d.imageSections,
        pageCount: d.pageCount ?? lastSavedRef.current.pageCount,
      };
    },
    [projectId, chapterId],
  );

  const { state, retry, saveNow } = useAutoSave(draft, saveDraft, 2_000, !inputLocked);

  // PROJ-34: Ein neuer Abschnitt wird sofort gespeichert, nicht erst nach der
  // Pause. Der Effekt läuft nach dem Effekt von useAutoSave und sieht den neuen Stand.
  const saveAfterInsertRef = useRef(false);
  useEffect(() => {
    if (!saveAfterInsertRef.current) return;
    saveAfterInsertRef.current = false;
    saveNow();
  }, [draft, saveNow]);

  // Editor-Ready-Flag setzen, sobald die initialen Pagination-Settling-
  // Passes durch sind. Der Editor mountet, lädt Body/Images, läuft durch
  // die Settling-Timer (max 5 000 ms) — danach ist das Layout stabil
  // und wir fadeen den Stack in einem Schwung ein.
  // Bilder werden zusätzlich abgewartet (load-Listener), damit kein
  // halb-geladenes Bild kurz die Page-Höhe springen lässt.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const fg = fgRef.current;
    const imgs = fg ? Array.from(fg.querySelectorAll("img")) : [];
    const allImagesLoaded = () =>
      imgs.every((img) => img.complete && img.naturalHeight > 0);
    const markReady = () => {
      if (cancelled) return;
      setEditorReady(true);
    };
    // Wenn alle Bilder bereits geladen sind, nach dem letzten Settling-
    // Timer (5 000 ms) markieren. Sonst auf Image-Loads warten + Timer.
    if (allImagesLoaded()) {
      const timer = setTimeout(markReady, 5200);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    let imgsRemaining = imgs.filter((img) => !img.complete).length;
    const onLoad = () => {
      imgsRemaining--;
      if (imgsRemaining <= 0) markReady();
    };
    for (const img of imgs) {
      if (!img.complete) img.addEventListener("load", onLoad, { once: true });
    }
    // Safety: nach 8 s in jedem Fall freigeben (sehr langsame Bild-Loads
    // sollen die UX nicht ewig blockieren).
    const fallback = setTimeout(markReady, 8000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      for (const img of imgs) img.removeEventListener("load", onLoad);
    };
  }, [editor]);

  // PROJ-30: Früher blieb jedes Kapitel über fünf Sekunden ausgeblendet. Jetzt
  // erscheint es, sobald Schriften geladen sind und sich die Höhe nicht mehr
  // ändert, spätestens nach CONTENT_REVEAL_MAX_MS.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    let lastHeight = -1;
    let stableChecks = 0;
    const reveal = () => {
      if (!cancelled) setContentVisible(true);
    };
    const fallback = setTimeout(reveal, CONTENT_REVEAL_MAX_MS);
    const check = () => {
      if (cancelled) return;
      const fg = fgRef.current;
      const height = fg?.getBoundingClientRect().height ?? 0;
      const imagesDone =
        !fg || Array.from(fg.querySelectorAll("img")).every((img) => img.complete);
      stableChecks = height === lastHeight && imagesDone ? stableChecks + 1 : 0;
      lastHeight = height;
      if (stableChecks >= CONTENT_STABLE_CHECKS) {
        reveal();
        return;
      }
      checkTimer = setTimeout(check, CONTENT_CHECK_MS);
    };
    void document.fonts.ready.then(check);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      if (checkTimer) clearTimeout(checkTimer);
    };
  }, [editor]);

  const uploadImage = useCallback(
    (section: string) =>
      async (img: UploadedImage): Promise<ChapterImage> => {
        // Upload in drei Schritten, damit große Fotos nicht an der 1-MB-
        // Grenze der Server Actions scheitern (Fix 2026-11-20): Link holen,
        // Datei direkt in den Bucket, dann eintragen.
        const contentType = img.blob.type || "image/jpeg";
        const prep = await chapterImageUploadPrepareAction({
          projectId,
          chapterId,
          section,
          contentType,
          size: img.blob.size,
        });
        if (prep.error || !prep.upload) {
          toast.error(prep.error ?? "Bild-Upload fehlgeschlagen.");
          throw new Error(prep.error ?? "upload-failed");
        }
        const { error: putErr } = await createBrowserSupabase()
          .storage.from("chapter-heroes")
          .uploadToSignedUrl(prep.upload.storagePath, prep.upload.token, img.blob, {
            contentType,
          });
        if (putErr) {
          toast.error("Bild-Upload fehlgeschlagen.");
          throw new Error(putErr.message);
        }
        const res = await chapterImageUploadCommitAction({
          projectId,
          chapterId,
          section,
          imageId: prep.upload.imageId,
          storagePath: prep.upload.storagePath,
          format: img.format,
        });
        if (res.error || !res.image) {
          toast.error(res.error ?? "Bild-Upload fehlgeschlagen.");
          throw new Error(res.error ?? "upload-failed");
        }
        // Lokales Blob-Preview-URL freigeben — die Server-Antwort liefert
        // die Signed-URL aus dem Bucket.
        if (img.previewUrl.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl);
        return res.image;
      },
    [projectId, chapterId],
  );

  const deleteImage = useCallback(
    (section: string) =>
      async (image: ChapterImage): Promise<void> => {
        const res = await chapterImageDeleteAction({
          projectId,
          chapterId,
          section,
          imageId: image.id,
        });
        if (res.error) {
          toast.error(res.error);
          throw new Error(res.error);
        }
        if (image.signed_url.startsWith("blob:")) URL.revokeObjectURL(image.signed_url);
      },
    [projectId, chapterId],
  );

  // PROJ-34: Scheitert ein Foto beim Laden (Link nach einer Stunde abgelaufen,
  // etwa nach „Rückgängig", oder kurzer Netzaussetzer), holt der Editor einen
  // frischen Link und baut das Foto neu auf, höchstens dreimal (freshImageLinks.ts).
  const [freshLinks, setFreshLinks] = useState<FreshLinks>({});
  const linkRefresherRef = useRef<LinkRefresher | null>(null);
  useEffect(
    () => () => {
      linkRefresherRef.current?.stop();
      linkRefresherRef.current = null;
    },
    [projectId, chapterId],
  );
  const requestFreshLink = useCallback(
    (storagePath: string) => {
      linkRefresherRef.current ??= createLinkRefresher({
        fetchLinks: async (paths) => (await chapterImageLinksAction({ projectId, chapterId, paths })).links,
        onChange: setFreshLinks,
        isAllowed: (path) => isInProjectFolder(path, projectId),
      });
      linkRefresherRef.current.request(storagePath);
    },
    [projectId, chapterId],
  );

  // Fotos, die der Text wirklich verwendet. Entfernte Abschnitte bleiben für
  // „Rückgängig" im Speicher, zählen aber nicht zur Grenze.
  const usedPhotos = useMemo(
    () =>
      collectImageSectionIds(body).reduce<number>((sum, id) => {
        const section = typeof id === "string" ? getImageSection(imageSections, id) : undefined;
        return sum + (section?.images.length ?? 0);
      }, 0),
    [body, imageSections],
  );
  const photoLimitReached = usedPhotos >= MAX_IMAGES_PER_CHAPTER;

  const imageApi = useMemo<ImageSectionsApi>(
    () => ({
      sectionById: (id) => getImageSection(imageSections, id),
      readOnly: inputLocked,
      freshLinks,
      canAddPhoto: (id) =>
        !photoLimitReached &&
        (getImageSection(imageSections, id)?.images.length ?? 0) < MAX_IMAGES_PER_SECTION,
      changeSection: (id: string, next: ImageSectionData) => {
        setImageSections((prev) => withImageSection(prev, id, next));
      },
      uploadPhoto: (id, image) => uploadImage(id)(image),
      deletePhoto: (id, image) => deleteImage(id)(image),
      removeSection: (id) => {
        editor?.commands.removeImageSection(id);
      },
      onPhotoError: requestFreshLink,
    }),
    [imageSections, inputLocked, freshLinks, photoLimitReached, uploadImage, deleteImage, editor, requestFreshLink],
  );

  // PROJ-34: Erst das Foto, dann der Abschnitt. So gibt es nie ein leeres Element,
  // das im Editor Platz einnimmt und im Druck fehlt.
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const insertSectionWithPhoto = useCallback(
    async (img: UploadedImage): Promise<boolean> => {
      if (!editor) return false;
      const sectionId = crypto.randomUUID();
      let image: ChapterImage;
      try {
        image = await uploadImage(sectionId)(img);
      } catch {
        return false; // Die Meldung kam bereits beim Upload.
      }
      flushSync(() => {
        setImageSections((prev) =>
          withImageSection(prev, sectionId, { layout: "1-spaltig", images: [image] }),
        );
      });
      if (!editor.commands.insertImageSection(sectionId)) {
        // Die Stelle grenzt inzwischen an einen Abschnitt: Das Foto geht trotzdem nicht verloren.
        editor.chain().setTextSelection(editor.state.doc.content.size - 1).insertImageSection(sectionId).run();
      }
      saveAfterInsertRef.current = true;
      return true;
    },
    [editor, uploadImage],
  );

  // PROJ-34: Rückfrage, bevor Fotos aus dem Text verschwinden.
  const [pendingRemoval, setPendingRemoval] = useState<SectionRemovalRequest | null>(null);
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.imageSection;
    storage.onRemovalRequest = (request) => setPendingRemoval(request);
    return () => {
      storage.onRemovalRequest = null;
    };
  }, [editor]);
  const removalPhotos = (pendingRemoval?.sectionIds ?? []).reduce(
    (sum, id) => sum + (getImageSection(imageSections, id)?.images.length ?? 0),
    0,
  );
  const photoLabel = removalPhotos === 1 ? "1 Foto" : `${removalPhotos} Fotos`;
  const removalTitle =
    (pendingRemoval?.sectionIds.length ?? 0) > 1
      ? `${pendingRemoval?.sectionIds.length} Bildabschnitte mit ${photoLabel} entfernen?`
      : `Bildabschnitt mit ${photoLabel} entfernen?`;

  // Klick auf leere Fläche einer Seite (Seitenränder, Weißraum unter dem
  // letzten Absatz, Lücken zwischen Bild-Sektion und Text): Cursor in die
  // nächstgelegene Zeile setzen, horizontal an der Klickposition — wie in
  // Word/Docs. Früher sprang der Cursor immer ans Dokumentende (auch bei
  // einem Klick in den Seitenrand neben Seite 1), und der Weißraum unter
  // dem Text reagierte gar nicht, weil er nicht zum Vordergrund-Layer
  // gehört. `e.target === e.currentTarget` filtert Klicks auf Kinder aus
  // (Editor, Bild-Sektion, Kopf behalten ihre eigene Klick-Logik); der
  // Handler hängt deshalb an Stack UND Vordergrund-Layer.
  const handleBlankAreaMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inputLocked || e.target !== e.currentTarget || !editor || e.button !== 0) return;
    e.preventDefault();
    if (!placeCaretNearPoint(editor.view, e.clientX, e.clientY, e.shiftKey)) {
      editor.commands.focus("end");
    }
  };

  return (
    <div
      className="a5-desk [font-family:var(--font-lato)] flex min-h-[100dvh] flex-col"
      style={{ ["--ui-zoom" as string]: String(zoom) }}
    >
      {/* UI-Zoom-Wrapper: skaliert Toolbar, Header, Editor-Seiten und Bild-
          Sektionen rein VISUELL (transform: scale via CSS-Variable
          --ui-zoom). Pagination-Engine und Layout-Berechnungen rechnen
          weiterhin mit 1×-Werten — A5-Logik bleibt unverändert, sodass
          der spätere PDF-Export (PROJ-16) konsistent bleibt. */}
      {/* Toolbar an top:0 — direkt im Document-Flow, kein verschachtelter
          Parent. Sticky funktioniert immer, weil document.scrollingElement
          die nächste scroll-Ancestor ist. */}
      <EditorToolbar
        editor={editor}
        readOnly={inputLocked}
        photoLimitReached={photoLimitReached}
        onInsertImageSection={() => setInsertDialogOpen(true)}
      />
      <ImageUploadDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
        onUploaded={insertSectionWithPhoto}
        onClosedFocus={() => editor?.view.focus()}
      />
      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            editor?.view.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">{removalTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Die Fotos verschwinden aus diesem Kapitel. Mit „Rückgängig“ holen Sie sie zurück.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pendingRemoval?.confirm();
                setPendingRemoval(null);
              }}
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chrome unter der Toolbar — scrollt natürlich weg */}
      <header className="flex flex-col gap-2 border-b border-[#e0dcd5] bg-[#ece6df] px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link
          href={`/projektuebersicht/${projectId}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-[#3E3831] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Projektübersicht
        </Link>
        <div className="flex flex-1 items-center gap-3 md:justify-center">
          {/* Wrapper-Label: das Stift-Icon sitzt als Affordance NEBEN dem
              Input. Click auf das Icon fokussiert den Input (label-für-
              input-Verhalten). */}
          <label
            className={`flex w-full max-w-md items-center justify-center gap-2 ${
              readOnly ? "" : "cursor-text"
            }`}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={inputLocked}
              placeholder="Kapitel-Titel"
              className={`[font-family:var(--font-merriweather)] flex-1 border-0 border-b border-transparent bg-transparent px-1 py-1 text-center text-lg text-[#3E3831] outline-none transition-colors md:text-xl ${
                readOnly ? "cursor-default" : "focus:border-[#96B897]"
              }`}
              aria-label="Kapitel-Titel"
            />
            {!readOnly && (
              <Pencil
                className="h-4 w-4 shrink-0 text-[#848484]"
                aria-hidden
              />
            )}
          </label>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 md:min-w-[12rem]">
          {readOnly ? (
            <span className="text-sm text-[#848484]">Nur zum Ansehen</span>
          ) : (
            <SaveStatus state={state} onRetry={retry} />
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-8 px-4 py-8 pb-16 sm:px-6 md:px-10">
        {/* PROJ-8: Leitfragen-Banner für Impuls-Kapitel.
            Wird nur gerendert, wenn das Kapitel einen referenzierten Impuls
            aus dem Katalog hat. Sitzt VOR dem A5-Stack, NICHT auf die
            A5-Seite gelegt (Spec AC). */}
        {initialImpulse && (
          <ImpulseHintBanner
            title={initialImpulse.title}
            leadingQuestions={initialImpulse.leadingQuestions}
          />
        )}
        {!contentVisible && (
          // Der A5-Stack bleibt unsichtbar, bis das Layout ruhig ist. Das
          // verhindert das „zerstückelte" Erscheinen beim Öffnen. PROJ-25:
          // Dieselbe Ansicht wie beim Warten auf den Server, damit man nur
          // einen Ladezustand sieht.
          <div className="pointer-events-none visible fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#FAF8F6]">
            <EditorLoadingScreen as="div" />
          </div>
        )}
        <div
          className="a5-stack"
          data-chapter-id={chapterId}
          data-ready={editorReady ? "1" : "0"}
          data-visible={contentVisible ? "1" : "0"}
          ref={stackRef}
          onMouseDown={handleBlankAreaMouseDown}
          style={{
            // bg-Layer (absolute) stapelt N Frames + Gaps; ohne min-height
            // ragt der bg-Layer unter den .a5-stack-Container und damit
            // unter die desk-Wrapper hinaus. Wir machen den stack mindestens
            // so groß wie der bg-Layer, damit die Desk-Farbe bis ans
            // Editor-Ende reicht und der bg-background nicht durchschimmert.
            minHeight: `calc(${pageCount} * (var(--a5-page-height) + var(--a5-page-gap)) - var(--a5-page-gap))`,
          }}
        >
          {/* Hintergrund-Layer: N fest-große A5-Frames als weißer Hintergrund. */}
          <div className="a5-stack__bg" aria-hidden>
            {Array.from({ length: pageCount }).map((_, i) => (
              <div key={i} className="a5-page-frame" />
            ))}
          </div>
          {/* Vordergrund-Layer: Editor + Bild-Sektionen */}
          <div
            className="a5-stack__fg"
            ref={fgRef}
            onMouseDown={handleBlankAreaMouseDown}
          >
            <FirstPageHeader title={title} />
            <ImageSectionsProvider value={imageApi}>
              <EditorContent editor={editor} />
            </ImageSectionsProvider>
          </div>
          {/* Seitenzahl-Overlay: über FG, damit Zahlen nicht von Bildern
              oder Text in der oberen rechten Ecke verdeckt werden.
              PROJ-7: buchweite Zahl = startPage + lokaler-Index. startPage
              ist konstant für die Editor-Session (Spec-Sektion C). */}
          <div className="a5-stack__numbers" aria-hidden>
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                className="a5-page-number"
                // Position: Mittelpunkt der Diagonale zwischen oberer rechter
                // Seiten-Ecke und oberer rechter Inhalts-Ecke. Top-Offset =
                // margin-top / 2 (vertikale Hälfte der Marge). Translate
                // (-50%) im CSS zentriert die Zahl auf diesem Punkt.
                style={{ top: `calc(${i} * (var(--a5-page-height) + var(--a5-page-gap)) + var(--a5-margin-top) / 2)` }}
              >
                {startPage + i}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[#e0dcd5] bg-[#ece6df] px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <WordCount words={wordCount} />
          <ZoomControl zoom={zoom} onChange={changeZoom} />
        </div>
        <span className="hidden text-xs text-[#a8a39b] sm:inline">
          {pageCount === 1 ? "Seite 1" : `${pageCount} Seiten`} · A5-Format · Druck-Vorschau
        </span>
      </footer>
    </div>
  );
}

// PROJ-34: Fest statt bei jedem Rendern neu. TipTap vergleicht die Optionen und
// setzt sie bei jeder Abweichung neu, dabei entstanden die Bildabschnitte jedes
// Mal neu und verloren offene Dialoge.
//
// Word-/Docs-Verhalten: nach jeder Eingabe folgt der Viewport dem Cursor. Wir
// nutzen NICHT mehr `() => true` (das hatte ProseMirrors scrollIntoView komplett
// deaktiviert) — stattdessen lassen wir ProseMirror standardmäßig in den View
// scrollen UND glätten den Effekt nach der Pagination-Engine selbst per
// `keepCursorInView` (sonst kann ein nachträglich eingefügter Spacer den Cursor
// wieder aus dem Viewport schieben).
const EDITOR_PROPS = {
  attributes: {
    class: "tiptap-editor focus:outline-none",
  },
};

function toPlainJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const CONTENT_CHECK_MS = 60;
const CONTENT_STABLE_CHECKS = 3;
const CONTENT_REVEAL_MAX_MS = 900;

function estimateColorPages(s: ImageSections, body: unknown): number {
  const rows = (sec: ImageSectionData) =>
    Math.ceil(sec.images.length / (sec.layout === "2-spaltig" ? 2 : 1));
  const pagesPer = (rowCount: number) => Math.ceil(rowCount / 2);
  return collectImageSectionIds(body).reduce<number>((sum, id) => {
    const section = typeof id === "string" ? getImageSection(s, id) : undefined;
    return sum + (section ? pagesPer(rows(section)) : 0);
  }, 0);
}
