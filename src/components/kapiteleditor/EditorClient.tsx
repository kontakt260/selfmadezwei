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
        <div
          className="a5-stack"
          data-chapter-id={chapterId}
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
          <div className="a5-stack__fg" ref={fgRef}>
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

      let fittedCount = 0;
      let fittedScale = 1;
      for (let k = rows1Col.length; k >= 1; k--) {
        const naturalH = k * naturalRowH1Col + (k - 1) * sectionRowGap;
        if (naturalH <= availableOnCurrentPage + 0.5) {
          fittedCount = k;
          fittedScale = 1;
          break;
        }
        const scaleNeeded =
          (availableOnCurrentPage - (k - 1) * sectionRowGap) / (k * naturalRowH1Col);
        if (scaleNeeded >= MIN_SCALE) {
          fittedCount = k;
          fittedScale = scaleNeeded;
          break;
        }
      }

      if (fittedCount > 0 && fittedScale < 1) {
        for (let i = 0; i < fittedCount; i++) {
          rows1Col[i].style.setProperty("--row-image-scale", fittedScale.toFixed(4));
        }
      }
    }
    // Reflow nach Scale-Änderungen, damit die anschließenden
    // Block-Push-Messungen die neue Reihen-Höhe sehen.
    void fg.offsetHeight;

    // Block-Push für TEXT-Absätze (Editor-Blöcke) ist obsolet — die Soft-
    // Break-Engine in PaginationDecorations splittet Multi-Line-Absätze
    // zeilenweise und pusht 1-Zeilen-Blöcke via Widget-Decoration. Wenn
    // wir hier zusätzlich marginTop auf den Paragraph-DOM-Knoten setzen,
    // schieben wir den ganzen Absatz nach unten — die Soft-Break-Spacer
    // im Inneren verlieren ihre Wirkung, und die ersten Zeilen landen NICHT
    // mehr auf der aktuellen Seite.
    //
    // Hier nur noch Image-Rows und Page-Breaks verarbeiten.
    type Item = { el: HTMLElement; kind: "break" | "block" };
    const items: Item[] = [
      ...breaks.map<Item>((el) => ({ el, kind: "break" })),
      ...imageRows.map<Item>((el) => ({ el, kind: "block" })),
    ];
    items.sort((a, b) => inFgContent(a.el) - inFgContent(b.el));

    for (const item of items) {
      const observedTop = inFgContent(item.el);
      const observedHeight = elH(item.el);

      // Welche Seite trägt diesen Item-Top aktuell?
      const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
      const frameContentBottom = frameIdx * stridePx + pageContentHeight;
      const nextFrameContentTop = (frameIdx + 1) * stridePx;

      if (item.kind === "break") {
        // Page-Break: Höhe so setzen, dass der nächste Block am Content-Top
        // der Folgeseite ankommt.
        const currentHeight = elH(item.el);
        // Edge-Case: zwei Seitenumbrüche unmittelbar hintereinander
        // (Word-Verhalten „echte leere Seite dazwischen"). Wenn der Break
        // direkt am Frame-Content-Top startet, würde nextFrameContentTop -
        // observedTop ≈ 0 ergeben → kein Push, keine leere Seite. Wir
        // verlangen deshalb mindestens eine ganze Seitenlänge.
        // Math.round (statt floor), um Boundary-Treffer wie 833.0 vs 833.7
        // korrekt zu erkennen.
        const nearestFrameContentTop = Math.round(observedTop / stridePx) * stridePx;
        const atFrameTop = Math.abs(observedTop - nearestFrameContentTop) < 1;
        const desiredHeight = atFrameTop
          ? stridePx
          : nextFrameContentTop - observedTop;
        if (desiredHeight > gapPx + 0.5 && Math.abs(desiredHeight - currentHeight) > 0.5) {
          item.el.style.height = `${desiredHeight}px`;
        }
      } else {
        // Block: läuft er über die Content-Untergrenze seiner aktuellen Seite?
        const observedBottom = observedTop + observedHeight;
        // Skalierte Reihen werden GRUNDSÄTZLICH vertraut, ABER nur wenn sie
        // ihre Seite TATSÄCHLICH nicht verletzen. PASS A kann bei stalem
        // Mess-Zeitpunkt (PD-Spacer noch nicht final) zu optimistisch
        // skalieren — dann landet eine vermeintlich passende Reihe doch
        // im Seitenzwischenraum (Bug 2026-05-20: Bild im Page-Gap nach
        // Bild-Einfügen). Wenn die skalierte Reihe > 30 px über den
        // Content-Bereich ragt, override PASS A's Entscheidung und push.
        const hasScale = !!item.el.style.getPropertyValue("--row-image-scale");
        if (hasScale && observedBottom <= frameContentBottom + 30) continue;
        // Strikter 2-cm-Margin-Schutz: jede Reihe, die über die Content-
        // Untergrenze ragt, wird gepusht. Stabilität gegen PD-Transient-
        // Schwankungen kommt aus dem Push-Delta-History-Check unten (delta
        // muss zwischen zwei aufeinanderfolgenden Recalcs konsistent sein,
        // sonst wird der Push deferred — verhindert Flackern, hält aber
        // den 2-cm-Margin streng ein).
        if (observedBottom > frameContentBottom + 0.5) {
          // Block größer als ganze Seite? Push würde nichts bringen, v2 macht Soft-Break.
          if (observedHeight > pageContentHeight + 0.5) continue;
          // Delta: wo soll der Block hin (nextFrameContentTop) vs wo ist er (observedTop)
          const delta = nextFrameContentTop - observedTop;
          if (delta > 0.5) {
            const currentMargin = parseFloat(item.el.style.marginTop) ||
              parseFloat(getComputedStyle(item.el).marginTop) || 0;
            item.el.style.marginTop = `${currentMargin + delta}px`;
          }
        }
        // KEIN else-Branch: wenn der Block fits, lassen wir ihn in Ruhe.
        // Keine Style-Mutation = kein Layout-Shift = kein Scroll-Sprung.
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
