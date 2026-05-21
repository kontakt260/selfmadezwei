"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { ArrowLeft } from "lucide-react";
import { editorExtensions } from "./tiptap/extensions";
import { EditorToolbar } from "./EditorToolbar";
import { FirstPageHeader } from "./FirstPageTemplate";
import { ImageSection } from "./ImageSection";
import { SaveStatus } from "./SaveStatus";
import { WordCount } from "./WordCount";
import { ZoomControl, DEFAULT_ZOOM, type ZoomLevel } from "./ZoomControl";
import { useAutoSave } from "@/hooks/useAutoSave";
import { countWordsFromBody } from "@/lib/kapiteleditor/countWords";
import {
  EMPTY_IMAGE_SECTIONS,
  type ChapterDraft,
  type ChapterImage,
  type ImageSections,
} from "@/lib/kapiteleditor/types";
import type { UploadedImage } from "./ImageUploadDialog";
import {
  chapterAutosaveAction,
  chapterImageUploadAction,
  chapterImageDeleteAction,
} from "@/app/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]/actions";
import { toast } from "sonner";

type Props = {
  projectId: string;
  chapterId: string;
  initialTitle: string;
  initialBody: unknown;
  initialImageSections: ImageSections;
};

export function EditorClient({
  projectId,
  chapterId,
  initialTitle,
  initialBody,
  initialImageSections,
}: Props) {
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

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialBody ?? undefined,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none",
      },
      // Word-/Docs-Verhalten: nach jeder Eingabe folgt der Viewport dem
      // Cursor. Wir nutzen NICHT mehr `() => true` (das hatte ProseMirrors
      // scrollIntoView komplett deaktiviert) — stattdessen lassen wir
      // ProseMirror standardmäßig in den View scrollen UND glätten den
      // Effekt nach der Pagination-Engine selbst per `keepCursorInView`
      // unten (sonst kann ein nachträglich eingefügter Spacer den Cursor
      // wieder aus dem Viewport schieben).
    },
    onUpdate: ({ editor }) => {
      setBody(editor.getJSON());
      keepCursorInView(editor);
    },
    immediatelyRender: false,
  });

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      [...imageSections.start.images, ...imageSections.end.images].forEach((img) => {
        if (img.signed_url.startsWith("blob:")) URL.revokeObjectURL(img.signed_url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft: ChapterDraft = useMemo(
    () => ({
      title,
      body,
      imageSections,
      colorPageCount: estimateColorPages(imageSections),
    }),
    [title, body, imageSections],
  );

  const saveDraft = useCallback(
    async (d: ChapterDraft): Promise<void> => {
      const res = await chapterAutosaveAction({
        projectId,
        chapterId,
        title: d.title,
        body: d.body,
        imageSections: d.imageSections,
        colorPageCount: d.colorPageCount,
      });
      if (res.error) throw new Error(res.error);
    },
    [projectId, chapterId],
  );

  const { state, retry } = useAutoSave(draft, saveDraft, 2_000);

  const wordCount = useMemo(() => countWordsFromBody(body), [body]);

  const stackRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);

  const { pageCount } = usePagination({
    editor,
    stackRef,
    fgRef,
    imageSectionsDeps: imageSections,
    titleDep: title,
  });

  // Trigger PaginationDecorations (ProseMirror plugin) bei React-State-
  // Änderungen, die keine Doc-Transaktion auslösen — sonst zeigen Image-
  // Section-Mutationen erst nach der nächsten Texteingabe Wirkung.
  useEffect(() => {
    document.dispatchEvent(new Event("narravit:pagination-recompute"));
  }, [imageSections, title]);

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

  // Bild-Skalierung: Per-Row, eingebettet in usePagination → recalc().
  // Spec 2026-05-20: jede 1-spaltig-Sektion füllt zuerst den Restplatz der
  // aktuellen Seite mit so vielen Reihen wie passen (Min-Scale 0.65); die
  // übrigen Reihen rutschen via Block-Push ungeskaliert auf Folgeseiten.
  // Implementation siehe usePagination unten.

  const updateSection = (key: "start" | "end") => (next: ImageSections["start"]) => {
    setImageSections((prev) => ({ ...prev, [key]: next }));
  };

  const uploadImage = useCallback(
    (section: "start" | "end") =>
      async (img: UploadedImage): Promise<ChapterImage> => {
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("chapterId", chapterId);
        fd.set("section", section);
        fd.set("file", img.blob, img.fileName);
        const res = await chapterImageUploadAction(fd);
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
    (section: "start" | "end") =>
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
      <EditorToolbar editor={editor} />

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
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kapitel-Titel"
            className="[font-family:var(--font-merriweather)] w-full max-w-md border-0 border-b border-transparent bg-transparent px-1 py-1 text-center text-lg text-[#3E3831] outline-none transition-colors focus:border-[#96B897] md:text-xl"
            aria-label="Kapitel-Titel"
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 md:min-w-[12rem]">
          <SaveStatus state={state} onRetry={retry} />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-8 px-4 py-8 pb-16 sm:px-6 md:px-10">
        {!editorReady && (
          // Lade-Animation während Initial-Mount + Pagination-Settling.
          // Wir blenden ein zentriertes Spinner-Element über dem Tisch
          // ein. Der A5-Stack selbst ist unsichtbar (opacity 0), bis
          // das Layout stabil ist — verhindert das „zerstückelte"
          // Initial-Rendering (Text → Pagination-Shifts → Image-Loads).
          <div
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[var(--a5-desk-color)] transition-opacity duration-300"
            aria-hidden
          >
            <div className="flex flex-col items-center gap-3 text-[#3E3831]/70">
              <svg
                className="h-6 w-6 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <p className="text-sm">Kapitel wird vorbereitet …</p>
            </div>
          </div>
        )}
        <div
          className="a5-stack a5-stack--loading"
          data-chapter-id={chapterId}
          data-ready={editorReady ? "1" : "0"}
          ref={stackRef}
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
            onMouseDown={(e) => {
              // Klick auf leere Weiß-Fläche (Padding der FG, Bereich
              // unterhalb des letzten Absatzes, Klick zwischen Bild-Sektion
              // und nächstem Element) soll den Cursor auf das Dokument-Ende
              // setzen — wie in Word/Docs. Audit Bug 8: Heute reagiert der
              // Editor an dieser Stelle gar nicht, weil ProseMirror den
              // weißen Bereich physisch nicht ausfüllt.
              // `e.target === e.currentTarget` filtert Bubble-Klicks von
              // Kindern aus (Editor, Image-Section, Header behalten ihre
              // eigene Klick-Logik).
              if (e.target === e.currentTarget && editor) {
                e.preventDefault();
                editor.commands.focus("end");
              }
            }}
          >
            <FirstPageHeader title={title} />
            <ImageSection
              data={imageSections.start}
              onChange={updateSection("start")}
              onUpload={uploadImage("start")}
              onDelete={deleteImage("start")}
            />
            <EditorContent editor={editor} />
            <ImageSection
              data={imageSections.end}
              onChange={updateSection("end")}
              onUpload={uploadImage("end")}
              onDelete={deleteImage("end")}
            />
          </div>
          {/* Seitenzahl-Overlay: über FG, damit Zahlen nicht von Bildern
              oder Text in der oberen rechten Ecke verdeckt werden. */}
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
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[#e0dcd5] bg-[#ece6df] px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <WordCount words={wordCount} />
          <ZoomControl zoom={zoom} onChange={setZoom} />
        </div>
        <span className="hidden text-xs text-[#a8a39b] sm:inline">
          {pageCount === 1 ? "Seite 1" : `${pageCount} Seiten`} · A5-Format · Druck-Vorschau
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination-Engine (Refinement 2026-05-18 — Spec PROJ-5 Sektion J)
// ---------------------------------------------------------------------------
//
// Delta-Algorithmus: KEIN Reset, KEIN State-Tracking, KEIN Body-Höhe-Schwanken.
//
// Pro Recalc:
//   1. Items in DOM-Reihenfolge sammeln (Editor-Blöcke, Bild-Reihen, Page-Breaks)
//   2. Für jedes Item Live-Position auslesen (getBoundingClientRect)
//   3. Wenn der Item-Bottom die Content-Untergrenze SEINER aktuellen Seite
//      überschreitet → DELTA = nächste Seite Content-Top - aktuelle Position
//      Anwendung: style.marginTop = currentInlineMargin + delta
//   4. Wenn KEIN Overflow → keine Style-Mutation, keine Layout-Veränderung,
//      kein Scroll-Sprung.
//
// Weil wir Live-Positionen verwenden und nur Diffs anwenden, konvergiert das
// in einem Pass: nach jedem Push verschieben sich die Folgeelemente in Flow
// natürlich, ihr nächstes `getBoundingClientRect()` liefert die neue Position.
//
// Trade-off (akzeptiert für v1): SHRINK-Fall ist nicht abgedeckt. Wenn der
// Nutzer Inhalt LÖSCHT und ein vorher gepushter Block wieder auf die
// vorherige Seite passen würde, bleibt der Push bestehen → akkumulierte
// Leerseiten. Lösung kommt in v2 (Reset-on-Shrink mit Snap-Back-Detection).

type PaginationDeps = {
  editor: Editor | null;
  stackRef: React.RefObject<HTMLDivElement | null>;
  fgRef: React.RefObject<HTMLDivElement | null>;
  imageSectionsDeps: ImageSections;
  titleDep: string;
};

function usePagination({ editor, stackRef, fgRef, imageSectionsDeps, titleDep }: PaginationDeps) {
  const [pageCount, setPageCount] = useState(1);
  const rafRef = useRef<number | null>(null);

  const recalc = useCallback(() => {
    const fg = fgRef.current;
    const stack = stackRef.current;
    if (!fg || !stack) return;

    const root = document.documentElement;
    const rootFont = parseFloat(getComputedStyle(root).fontSize) || 16;
    const fgStyle = getComputedStyle(fg);
    const topMarginPx = parseFloat(fgStyle.paddingTop) || 0;
    const bottomMarginPx = parseFloat(fgStyle.paddingBottom) || 0;

    const stackStyle = getComputedStyle(stack);
    const pageHeightStr = stackStyle.getPropertyValue("--a5-page-height").trim() || "210mm";
    const gapStr = stackStyle.getPropertyValue("--a5-page-gap").trim() || "2.5rem";
    const frameH = cssLengthToPx(pageHeightStr, rootFont);
    const gapPx = cssLengthToPx(gapStr, rootFont);
    // UI-Zoom faktorieren: transform: scale auf .a5-stack skaliert visuell
    // alle Kind-Elemente, getBoundingClientRect reportet die skalierten
    // Werte. Wir teilen alle Mess-Rects durch zoom, damit die Pagination
    // weiterhin gegen die LOGISCHEN A5-Werte (CSS-Vars, 1×) rechnet.
    const zoom = parseFloat(stackStyle.getPropertyValue("--ui-zoom") || "1") || 1;

    if (frameH <= 0 || topMarginPx + bottomMarginPx >= frameH) return;

    const stridePx = frameH + gapPx;
    const pageContentHeight = frameH - topMarginPx - bottomMarginPx;

    // Items in DOM-Reihenfolge sammeln.
    const breaks = Array.from(fg.querySelectorAll<HTMLElement>(".a5-page-break"));
    // Wir IGNORIEREN Block-Push- und Soft-Break-Spacer (PaginationDecorations
    // hat sie als Widgets gesetzt). Sonst würde der Block-Push-Engine sie als
    // eigene "Blöcke" erkennen und nochmal pushen → kumulativer Overshoot.
    const editorBlocks = Array.from(
      fg.querySelectorAll<HTMLElement>(
        ".tiptap-editor > *:not(.a5-page-break):not(.a5-block-push-spacer):not(.a5-soft-break-spacer)",
      ),
    );
    const imageRows = Array.from(fg.querySelectorAll<HTMLElement>("[data-paginate-row]"));

    // PASS 0 — Reset alle bisherigen Push-Margins/Höhen, damit wir den
    // natürlichen Flow messen (Spec PROJ-5 „SHRINK-Case": wenn Inhalt
    // gelöscht wird, sollen vorher gepushte Margins zurückfallen und keine
    // Phantom-Leerseiten am Ende übriglassen). Reset und Re-Push laufen
    // beide synchron im selben rAF-Tick → keine sichtbaren Sprünge.
    for (const el of editorBlocks) {
      if (el.style.marginTop) el.style.marginTop = "";
    }
    for (const el of imageRows) {
      if (el.style.marginTop) el.style.marginTop = "";
      // Row-Image-Scale ebenfalls zurücksetzen, damit PASS A unten gegen
      // die natürliche (ungeskalierte) Reihen-Höhe entscheidet.
      if (el.style.getPropertyValue("--row-image-scale")) {
        el.style.removeProperty("--row-image-scale");
      }
    }
    // Break-Höhen NICHT in PASS 0 löschen: PASS A misst End-Sektion-Position,
    // die durch HR-Page-Break-Höhen mitbestimmt wird. Wenn wir HR-Höhen hier
    // auf den natürlichen ~40px zurücksetzen, schiebt das End-Sektion um die
    // gesammelte Push-Differenz nach oben → PASS A scalet falsch.
    // PASS 1 unten aktualisiert die Höhen ohnehin korrekt (kann auch
    // schrumpfen), also kein Bedarf für vorheriges Clear.
    // Layout nach Reset einmal erzwingen, damit die anschließenden
    // getBoundingClientRect-Aufrufe die natürlichen Positionen liefern.
    void fg.offsetHeight;

    const fgTop = fg.getBoundingClientRect().top;
    // PASS 1a — Page-Break-HRs SETTLEN, BEVOR PASS A misst.
    // Begründung (Bug 2026-05-20, Page 14 mixed scales): PASS A muss
    // gegen STABILE Positionen entscheiden. Wenn wir HRs erst nach PASS A
    // anpassen, schiebt das Wachstum der HR die End-Sektion nach unten,
    // und die zuvor von PASS A geplante Page-Group-Zuordnung passt
    // nicht mehr — Reihen rutschen auf andere Seiten als geplant und
    // teilen sich dort mit anders skalierten Reihen die Seite.
    const inFgContentRaw = (el: HTMLElement) =>
      (el.getBoundingClientRect().top - fgTop) / zoom - topMarginPx;
    const elHRaw = (el: HTMLElement) => el.getBoundingClientRect().height / zoom;
    const breaksSorted = [...breaks].sort(
      (a, b) => inFgContentRaw(a) - inFgContentRaw(b),
    );
    // Fixpoint-Iteration: jede HR-Höhen-Anpassung verschiebt nachfolgende
    // HRs. Eine einzige Runde verfehlt diese Cascade. Max 5 Runden.
    const settleHRs = () => {
      let changed = false;
      for (const br of breaksSorted) {
        const observedTop = inFgContentRaw(br);
        const observedHeight = elHRaw(br);
        const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
        const nextFrameContentTop = (frameIdx + 1) * stridePx;
        const nearestFrameContentTop = Math.round(observedTop / stridePx) * stridePx;
        const atFrameTop = Math.abs(observedTop - nearestFrameContentTop) < 1;
        const desiredHeight = atFrameTop
          ? stridePx
          : nextFrameContentTop - observedTop;
        if (desiredHeight > gapPx + 0.5 && Math.abs(desiredHeight - observedHeight) > 0.5) {
          br.style.height = `${desiredHeight}px`;
          changed = true;
        }
      }
      return changed;
    };
    for (let iter = 0; iter < 5; iter++) {
      if (!settleHRs()) break;
      void fg.offsetHeight;
    }
    // Reflow nach HR-Adjustment — End-Sektion sitzt jetzt an ihrer
    // endgültigen Position.
    void fg.offsetHeight;
    // Alle Positions-Werte werden durch zoom geteilt, damit die Pagination
    // im LOGISCHEN A5-Koordinatensystem rechnet, selbst wenn die DOM-
    // Rects durch transform: scale visuell skaliert sind.
    const inFgContent = (el: HTMLElement) =>
      (el.getBoundingClientRect().top - fgTop) / zoom - topMarginPx;
    const elH = (el: HTMLElement) => el.getBoundingClientRect().height / zoom;

    // PASS A — Per-Row-Image-Scaling für 1-spaltig-Bild-Sektionen
    // (Spec 2026-05-20 vom Nutzer):
    //   "wenn zwei bilder im 1x1 eingefügt sind, sollen sie auch auf die
    //    kapitel startseite passen; das dritte bild beginnt dann auf einer
    //    neuen seite und kann die ursprüngliche größe beibehalten."
    //   Gilt analog für die End-Sektion: erste K Reihen werden runter-
    //   skaliert, um auf die aktuelle Seite zu passen — aber nur solange
    //   Skala ≥ MIN_SCALE bleibt. Restliche Reihen fließen ungeskaliert
    //   via Block-Push auf die Folgeseite.
    const MIN_SCALE = 0.65;
    const mmToPxLocal = (mm: number) => (mm / 25.4) * 96;
    const cmToPxLocal = (cm: number) => (cm / 2.54) * 96;
    const sectionContentWidth = mmToPxLocal(148) - cmToPxLocal(2) - cmToPxLocal(2.5);
    const naturalRowH1Col = sectionContentWidth * (2 / 3); // 3:2 bei voller Inhaltsbreite
    const sectionRowGap = mmToPxLocal(4);
    const sectionWrappers = Array.from(
      fg.querySelectorAll<HTMLElement>("[data-image-section-wrapper]"),
    );
    // Skalierung für START- UND END-Sektion: die ersten K Reihen werden
    // soweit verkleinert, dass sie auf die aktuelle Seite passen (Min-
    // Skala 0.65). Reihen darüber hinaus rutschen ungeskaliert via Block-
    // Push auf Folgeseiten — sodass das 2-cm-BottomMargin respektiert
    // wird ohne dass eine ansonsten passende Reihe leer auf die nächste
    // Seite gepusht wird (kein wasted space).
    // Iteratives Page-by-Page-Grouping: Wir packen N Reihen sequentiell auf
    // Seiten. Jede Page-Group erhält EINE uniforme Skala (Same-Size-Per-Page-
    // AC vom Nutzer 2026-05-20). Die erste Gruppe muss in den Restplatz der
    // aktuellen Seite passen; jede Folge-Gruppe in pageContentHeight.
    for (const wrapper of sectionWrappers) {
      const rows1Col = Array.from(
        wrapper.querySelectorAll<HTMLElement>(
          ":scope > [data-paginate-row][data-layout='1-spaltig']",
        ),
      );
      if (rows1Col.length === 0) continue;
      const firstRowTop = inFgContent(rows1Col[0]);
      const startFrameIdx = Math.max(0, Math.floor(firstRowTop / stridePx));
      const startFrameContentBottom = startFrameIdx * stridePx + pageContentHeight;
      const availableOnCurrentPage = Math.max(0, startFrameContentBottom - firstRowTop);

      let cursor = 0;
      let avail = availableOnCurrentPage;
      while (cursor < rows1Col.length) {
        const remaining = rows1Col.length - cursor;
        let groupCount = 0;
        let groupScale = 1;
        for (let k = remaining; k >= 1; k--) {
          const naturalH = k * naturalRowH1Col + (k - 1) * sectionRowGap;
          if (naturalH <= avail + 0.5) {
            groupCount = k;
            groupScale = 1;
            break;
          }
          const scaleNeeded =
            (avail - (k - 1) * sectionRowGap) / (k * naturalRowH1Col);
          if (scaleNeeded >= MIN_SCALE) {
            groupCount = k;
            groupScale = scaleNeeded;
            break;
          }
        }
        // Sicherheits-Fallback: passt nicht einmal eine Reihe → packe 1 mit
        // MIN_SCALE und gehe weiter (PASS 1 pusht ggf. zur nächsten Seite).
        if (groupCount === 0) {
          groupCount = 1;
          groupScale = MIN_SCALE;
        }
        if (groupScale < 1) {
          for (let i = cursor; i < cursor + groupCount; i++) {
            rows1Col[i].style.setProperty("--row-image-scale", groupScale.toFixed(4));
          }
        }
        cursor += groupCount;
        // Ab der zweiten Gruppe sitzt die Gruppe oben auf einer frischen
        // Seite und hat volle pageContentHeight zur Verfügung.
        avail = pageContentHeight;
      }
    }
    // Reflow nach Scale-Änderungen, damit die anschließenden
    // Block-Push-Messungen die neue Reihen-Höhe sehen.
    void fg.offsetHeight;

    // PASS 1b — Image-Row Block-Push.
    // HRs wurden bereits in PASS 1a vor PASS A gesettlet. Text-Block-Push
    // ist obsolet (Soft-Break-Engine in PaginationDecorations übernimmt das).
    // Hier nur noch Bild-Reihen prüfen und ggf. auf die nächste Seite schieben.
    const imageRowsSorted = [...imageRows].sort(
      (a, b) => inFgContent(a) - inFgContent(b),
    );
    for (const row of imageRowsSorted) {
      const observedTop = inFgContent(row);
      const observedHeight = elH(row);
      const observedBottom = observedTop + observedHeight;
      const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
      const frameContentBottom = frameIdx * stridePx + pageContentHeight;
      const nextFrameContentTop = (frameIdx + 1) * stridePx;

      // Skalierte Reihen werden GRUNDSÄTZLICH vertraut, ABER nur wenn sie
      // ihre Seite TATSÄCHLICH nicht verletzen. Wenn die skalierte Reihe
      // > 30 px über den Content-Bereich ragt, override PASS A's
      // Entscheidung und push.
      const hasScale = !!row.style.getPropertyValue("--row-image-scale");
      if (hasScale && observedBottom <= frameContentBottom + 30) continue;
      if (observedBottom > frameContentBottom + 0.5) {
        if (observedHeight > pageContentHeight + 0.5) continue;
        const delta = nextFrameContentTop - observedTop;
        if (delta > 0.5) {
          const currentMargin = parseFloat(row.style.marginTop) ||
            parseFloat(getComputedStyle(row).marginTop) || 0;
          row.style.marginTop = `${currentMargin + delta}px`;
        }
      }
    }

    // PASS Z — Post-hoc Same-Size-Per-Page-Normalisierung.
    // PASS A trifft optimale Group-Entscheidungen anhand der MESS-POSITIONEN
    // zum Zeitpunkt von PASS A. PaginationDecorations (PD) kann jedoch
    // ZEITGLEICH die Soft-Break-Spacer im Body anpassen → Body-Höhe wandert
    // → HRs verschieben sich → End-Sektion landet auf anderer Seite als
    // PASS A geplant hatte. Folge (Bug 2026-05-20 Page 14): Reihen mit
    // unterschiedlichen Skalen teilen sich eine Seite.
    // Fix: Nach PASS 1b sind die Positionen STABIL. Wir gruppieren erneut
    // nach Render-Seite und normalisieren auf die kleinste Skala der Gruppe.
    void fg.offsetHeight;
    const rowsByPage = new Map<number, HTMLElement[]>();
    for (const row of imageRows) {
      // Gruppierung via CENTER (nicht Top) — sonst landet eine Reihe, die
      // PASS 1b auf die nächste Seite gepusht hat, durch Fließkomma-
      // Rundung (z.B. logical top 833.5 vs stride 833.7) auf der FALSCHEN
      // Seite in PASS Z. Bug 2026-05-20: Row 2 pushed bei mt=191 zu
      // top≈833.5 → floor(833.5/833.7)=0, aber visuell auf Seite 2.
      const top = inFgContent(row);
      const h = elH(row);
      const center = top + h / 2;
      const page = Math.max(0, Math.floor(center / stridePx));
      if (!rowsByPage.has(page)) rowsByPage.set(page, []);
      rowsByPage.get(page)!.push(row);
    }
    for (const [, pageRows] of rowsByPage) {
      if (pageRows.length < 2) continue;
      let minScale = 1;
      for (const r of pageRows) {
        const s = parseFloat(r.style.getPropertyValue("--row-image-scale")) || 1;
        if (s < minScale) minScale = s;
      }
      if (minScale < 1) {
        for (const r of pageRows) {
          r.style.setProperty("--row-image-scale", minScale.toFixed(4));
        }
      }
    }

    // PASS 1d — Image-Row-Re-Push NACH allen Skalen-Änderungen.
    // PASS 1b hatte die Reihen gegen die UNSCALED-Layout-Position gepusht
    // (gleicher Race wie HRs). PASS A + PASS Z können danach Skalen ändern
    // → Inhalte über der Bild-Reihe verschieben sich → mt aus PASS 1b
    // passt nicht mehr (Bug 2026-05-21, Seite 8: End-Sektion-Bild ragt 88 px
    // in den Page-Gap vor Seite 8). Wir messen Reihen ein zweites Mal
    // gegen den endgültigen Layout-Stand und korrigieren mt ggf.
    void fg.offsetHeight;
    for (let iter = 0; iter < 5; iter++) {
      let anyChange = false;
      for (const row of imageRowsSorted) {
        const observedTop = inFgContent(row);
        const observedHeight = elH(row);
        // Page-Zuordnung via CENTER (analog PASS Z): wenn eine Reihe per
        // mt nahe an die Page-Boundary geschoben wurde, kann ihr Top
        // 1–88 px VOR dem Frame-Content-Top sitzen (Float-Rundung +
        // PD-Race). PASS 1b's Top-basierte Klassifizierung würde sie
        // dann als „auf voriger Seite überlaufend" einstufen — der
        // Push delta = (next_frame - top) wäre aber ~0, also kein Fix.
        // Center-basiert: die Reihe gehört zur Seite, deren Mitte sie
        // schneidet. Wenn ihr TOP < dieser Seiten-Content-Top liegt,
        // pushen wir bis zum Content-Top.
        const center = observedTop + observedHeight / 2;
        const pageIdx = Math.max(0, Math.floor(center / stridePx));
        const pageContentTop = pageIdx * stridePx;
        const pageContentBottom = pageIdx * stridePx + pageContentHeight;
        // Korrektur 1: Reihe ragt OBEN in den Page-Gap (Top < page-content-top)
        if (observedTop < pageContentTop - 0.5) {
          const delta = pageContentTop - observedTop;
          const currentMargin = parseFloat(row.style.marginTop) ||
            parseFloat(getComputedStyle(row).marginTop) || 0;
          row.style.marginTop = `${currentMargin + delta}px`;
          anyChange = true;
          continue;
        }
        // Korrektur 2: Reihe ragt UNTEN in den Page-Gap (Bottom > page-content-bottom)
        const observedBottom = observedTop + observedHeight;
        const hasScale = !!row.style.getPropertyValue("--row-image-scale");
        if (hasScale && observedBottom <= pageContentBottom + 30) continue;
        if (observedBottom > pageContentBottom + 0.5) {
          if (observedHeight > pageContentHeight + 0.5) continue;
          const nextFrameContentTop = (pageIdx + 1) * stridePx;
          const delta = nextFrameContentTop - observedTop;
          if (delta > 0.5) {
            const currentMargin = parseFloat(row.style.marginTop) ||
              parseFloat(getComputedStyle(row).marginTop) || 0;
            row.style.marginTop = `${currentMargin + delta}px`;
            anyChange = true;
          }
        }
      }
      if (!anyChange) break;
      void fg.offsetHeight;
      for (let hri = 0; hri < 3; hri++) {
        if (!settleHRs()) break;
        void fg.offsetHeight;
      }
    }

    // PASS 1c — HR-Re-Settling NACH allen Skalen-Änderungen.
    // PASS 1a hatte die HRs gegen die UNSCALED-Layout-Position gemessen
    // (PASS 0 hatte alle --row-image-scale gelöscht). PASS A + PASS Z
    // haben anschließend Skalen wieder gesetzt — Start-Sektion schrumpft
    // → Inhalte über HRs verschieben sich nach oben → die in PASS 1a
    // gesetzten HR-Höhen passen nicht mehr zum aktuellen observedTop.
    // Folge (Bug 2026-05-20, Seite 5 startet 88 px tief): die nächste
    // Seite beginnt nicht am Frame-Top.
    // Wir messen die HRs ein zweites Mal mit den ENDGÜLTIGEN Reihen-
    // Positionen und korrigieren ihre Höhen ggf.
    void fg.offsetHeight;
    for (let iter = 0; iter < 5; iter++) {
      let anyChange = false;
      for (const br of breaksSorted) {
        const observedTop = inFgContentRaw(br);
        const observedHeight = elHRaw(br);
        const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
        const nextFrameContentTop = (frameIdx + 1) * stridePx;
        const nearestFrameContentTop = Math.round(observedTop / stridePx) * stridePx;
        const atFrameTop = Math.abs(observedTop - nearestFrameContentTop) < 1;
        const desiredHeight = atFrameTop
          ? stridePx
          : nextFrameContentTop - observedTop;
        if (desiredHeight > gapPx + 0.5 && Math.abs(desiredHeight - observedHeight) > 0.5) {
          br.style.height = `${desiredHeight}px`;
          anyChange = true;
        }
      }
      if (!anyChange) break;
      void fg.offsetHeight;
    }

    // PASS 1e — Image-Row-Re-Push NACH PASS 1c's HR-Shrink.
    // PASS 1c hat HR-Höhen ggf. verkleinert (HR füllt nicht mehr ganz bis
    // zum nächsten Frame, weil Inhalt drüber durch PASS A/Z geschrumpft
    // war). Das schiebt Inhalte UNTERHALB des HR um den Shrink-Betrag
    // nach oben — End-Sektion-Bilder rutschen aus dem Page-Top hinaus,
    // ihre Tops liegen ~88 px VOR dem Frame-Content-Top (Bug 2026-05-21).
    // Wir korrigieren erneut center-basiert.
    void fg.offsetHeight;
    for (let iter = 0; iter < 5; iter++) {
      let anyChange = false;
      for (const row of imageRowsSorted) {
        const observedTop = inFgContent(row);
        const observedHeight = elH(row);
        const center = observedTop + observedHeight / 2;
        const pageIdx = Math.max(0, Math.floor(center / stridePx));
        const pageContentTop = pageIdx * stridePx;
        if (observedTop < pageContentTop - 0.5) {
          const delta = pageContentTop - observedTop;
          const currentMargin = parseFloat(row.style.marginTop) ||
            parseFloat(getComputedStyle(row).marginTop) || 0;
          row.style.marginTop = `${currentMargin + delta}px`;
          anyChange = true;
        }
      }
      if (!anyChange) break;
      void fg.offsetHeight;
    }

    // PASS G — Grow-Pass für untergröße Reihen (Audit-Folge 2026-05-21).
    // PASS A skaliert anfangs auf Basis einer Mess-Position, die später
    // durch HR-Settling + PD-Race + PASS 1e wandert. Wenn sich heraus-
    // stellt, dass eine Reihe auf einer Seite mit VIEL ungenutztem Platz
    // landet (Bug: Seite 4 zeigt End-Sektion-Bild bei Skala 0.65, obwohl
    // 369 px Restplatz übrig sind), soll die Skala zurückgewachsen werden
    // bis zum Maximum, das auf dieser Seite passt — capped bei 1.
    //
    // Same-Size-Per-Page bleibt erhalten: pro Seite wird die MAX zulässige
    // Skala aller Reihen auf dieser Seite ermittelt und einheitlich
    // angewendet.
    void fg.offsetHeight;
    {
      // Natürliche Reihen-Höhe (= scale 1) berechnen wir aus naturalRowH1Col
      // (bereits aus CSS-Vars ermittelt) — für 2-spaltig wäre der Wert
      // halbiert, aber PASS A skaliert nur 1-spaltig, also stimmt's hier.
      const rowsByPageGrow = new Map<number, HTMLElement[]>();
      for (const row of imageRows) {
        const top = inFgContent(row);
        const h = elH(row);
        const page = Math.max(0, Math.floor((top + h / 2) / stridePx));
        if (!rowsByPageGrow.has(page)) rowsByPageGrow.set(page, []);
        rowsByPageGrow.get(page)!.push(row);
      }
      for (const [pageIdx, pageRows] of rowsByPageGrow) {
        // Nur 1-spaltig-Reihen scale-uppen — 2-spaltig hat fixe Breite.
        const oneCol = pageRows.filter(
          (r) => r.getAttribute("data-layout") === "1-spaltig",
        );
        if (oneCol.length === 0) continue;
        // Max-Skala = (page_content_bottom - first_row_top) / total_natural_h
        // wobei total_natural_h = N * naturalRowH1Col + (N-1) * sectionRowGap
        const firstTop = inFgContent(oneCol[0]);
        const pageContentBottom = pageIdx * stridePx + pageContentHeight;
        const available = pageContentBottom - firstTop;
        const naturalTotalH =
          oneCol.length * naturalRowH1Col + (oneCol.length - 1) * sectionRowGap;
        if (naturalTotalH <= 0) continue;
        const maxScale = Math.min(1, available / naturalTotalH);
        // Aktuelle Skala der Gruppe (alle Reihen auf einer Seite haben
        // nach PASS Z dieselbe). Wenn Max > aktuell + 1 %, hochskalieren.
        const currentScale =
          parseFloat(oneCol[0].style.getPropertyValue("--row-image-scale")) || 1;
        if (maxScale > currentScale + 0.01) {
          const newScale = Math.max(currentScale, Math.min(1, maxScale));
          for (const r of oneCol) {
            if (newScale >= 0.9999) {
              r.style.removeProperty("--row-image-scale");
            } else {
              r.style.setProperty("--row-image-scale", newScale.toFixed(4));
            }
          }
        }
      }
    }

    // Page-Count = ceil((fg-Höhe) / Stride).
    const fgH = fg.getBoundingClientRect().height / zoom;
    const needed = Math.max(1, Math.ceil(fgH / stridePx));
    setPageCount((prev) => (prev !== needed ? needed : prev));
  }, [fgRef, stackRef]);

  // rAF-gebatcht mit cancel-and-requeue (Bug 2026-05-20: ohne cancel blieb
  // rafRef nach Next.js-Link-Re-Mount non-null hängen → recalc lief nie).
  // 10 Hz Throttle wurde getestet, bremst aber die Konvergenz zwischen
  // PD und usePagination zu stark, sodass Initial-Mount + Settling-Passes
  // nicht in unter 10 s zum Equilibrium kommen. Mit rAF (60 Hz max) ist
  // jede Eingabe nach ~50 ms stabil paginiert.
  const schedule = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recalc();
    });
  }, [recalc]);

  // Subscribe nur auf Doc-Änderungen — NICHT auf Selection-Wechsel.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => schedule();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, schedule]);

  // ResizeObserver auf FG für Layout-Änderungen außerhalb des Editors
  // (Bild-Upload, Layout-Wechsel, Window-Resize).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const obs = new ResizeObserver(() => schedule());
    obs.observe(fg);
    return () => obs.disconnect();
  }, [fgRef, schedule]);

  // MutationObserver: PD-Spacer-Updates können fg-Höhe konstant lassen
  // (Tausch zweier Spacer gleicher Gesamthöhe) → RO feuert nicht.
  // Wir lauschen nur auf childList-Mutationen (Widget-Add/Remove) — NICHT
  // auf style-attribute, sonst löst unser eigenes PASS-1b/1d setMarginTop
  // einen Endlos-Loop aus (60 recalcs/s gemessen 2026-05-21).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const mo = new MutationObserver(() => schedule());
    mo.observe(fg, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [fgRef, schedule]);


  // Trigger bei Title- oder Image-Section-Änderung.
  useEffect(() => {
    schedule();
  }, [imageSectionsDeps, titleDep, schedule]);

  // Re-run nach PaginationDecorations-Recompute. PD setzt Soft-Break-
  // Spacer im Text um, die die Text-Höhe verändern → End-Sektion rutscht
  // auf eine andere Seite → PASS A (Per-Row-Bild-Skalierung) muss neu
  // berechnen, sonst landen Bilder mit unterschiedlichen Skalen auf
  // derselben Seite (Bug 2026-05-20 vom Nutzer).
  useEffect(() => {
    const handler = () => schedule();
    document.addEventListener("narravit:pagination-recompute", handler);
    return () => document.removeEventListener("narravit:pagination-recompute", handler);
  }, [schedule]);

  // Initialer Pass + Settling-Passes nach 100/300/800/1500/3000/5000 ms +
  // ein letzter Safety-Pass alle paar Sekunden zur Konvergenz, auch wenn
  // PD/Image-Loads asynchron später feuern. Dispatcht zusätzlich das
  // narravit:pagination-recompute-Event, damit PD und usePagination
  // gemeinsam neu rechnen (PD-only-Schedule erzeugt keine usePagination-
  // Triggering, wenn fg-Höhe innerhalb der 5-px-Toleranz bleibt).
  useEffect(() => {
    const trigger = () => {
      schedule();
      document.dispatchEvent(new Event("narravit:pagination-recompute"));
    };
    trigger();
    const timers = [100, 300, 800, 1500, 3000, 5000].map((d) => setTimeout(trigger, d));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [schedule]);

  // Re-Schedule sobald irgendein <img> im FG fertig lädt (z. B. nach Signed-
  // URL-Fetch beim ersten Page-Load). MutationObserver + Load-Listener
  // fängt sowohl bestehende als auch neu hinzugefügte Bilder ab.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const attached = new WeakSet<HTMLImageElement>();
    const attach = (img: HTMLImageElement) => {
      if (attached.has(img)) return;
      attached.add(img);
      if (img.complete) return;
      img.addEventListener("load", schedule, { once: true });
      img.addEventListener("error", schedule, { once: true });
    };
    fg.querySelectorAll("img").forEach(attach);
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) attach(n);
          else if (n instanceof Element) n.querySelectorAll("img").forEach(attach);
        });
      }
    });
    mo.observe(fg, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [fgRef, schedule]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { pageCount };
}

// Word-/Docs-Verhalten: nach jeder Editor-Doc-Mutation schauen, ob der
// Cursor noch sichtbar ist. Wenn nicht (z. B. weil die Pagination-Engine
// einen Spacer eingefügt hat und den Cursor unter den Sticky-Toolbar/über
// den Viewport-Boden geschoben hat), Viewport sanft so verschieben, dass
// der Cursor wieder bequem im Lesebereich landet. Greift NICHT, wenn der
// User in einer Bild-Sektion arbeitet — die hat keinen Editor-Cursor.
function keepCursorInView(editor: Editor) {
  // Auf dem nächsten Frame messen (warten bis Pagination-Spacer applied sind)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const view = editor.view;
        if (!view || !view.hasFocus()) return;
        const coords = view.coordsAtPos(view.state.selection.head);
        const toolbar = document.querySelector(".editor-chrome") as HTMLElement | null;
        const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 0;
        const margin = 80; // Komfortzone unter Toolbar / über Fußleiste
        const viewportTop = toolbarBottom + margin;
        const viewportBottom = window.innerHeight - margin;
        if (coords.top < viewportTop) {
          window.scrollBy({
            top: coords.top - viewportTop,
            behavior: "smooth",
          });
        } else if (coords.bottom > viewportBottom) {
          window.scrollBy({
            top: coords.bottom - viewportBottom,
            behavior: "smooth",
          });
        }
      } catch {
        // ignore — coordsAtPos kann werfen, wenn DOM noch nicht synchronisiert
      }
    });
  });
}

function cssLengthToPx(value: string, rootFontPx: number): number {
  const v = value.trim();
  const num = parseFloat(v);
  if (Number.isNaN(num)) return 0;
  if (v.endsWith("mm")) return (num / 25.4) * 96;
  if (v.endsWith("cm")) return (num / 2.54) * 96;
  if (v.endsWith("in")) return num * 96;
  if (v.endsWith("rem")) return num * rootFontPx;
  if (v.endsWith("em")) return num * rootFontPx;
  return num;
}

function estimateColorPages(s: ImageSections): number {
  const rows = (sec: ImageSections["start"]) =>
    Math.ceil(sec.images.length / (sec.layout === "2-spaltig" ? 2 : 1));
  const pagesPer = (rowCount: number) => Math.ceil(rowCount / 2);
  return pagesPer(rows(s.start)) + pagesPer(rows(s.end));
}
