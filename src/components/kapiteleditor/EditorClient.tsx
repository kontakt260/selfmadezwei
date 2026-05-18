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
import { useAutoSave } from "@/hooks/useAutoSave";
import { countWordsFromBody } from "@/lib/kapiteleditor/countWords";
import {
  EMPTY_IMAGE_SECTIONS,
  type ChapterDraft,
  type ChapterImage,
  type ImageSections,
} from "@/lib/kapiteleditor/types";
import type { UploadedImage } from "./ImageUploadDialog";
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

  const { state, retry } = useAutoSave(draft, saveDraftStub, 2_000);

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

  // Dynamische Bild-Skalierung auf der Kapitel-Titelseite (Spec-Update
  // 2026-05-18): wenn die Start-Sektion im 1-spaltig-Layout genau 2 Bilder
  // enthält, sollen die Bilder zusammen mit dem Header auf Seite 1 passen.
  // Bei Bedarf werden sie bis 50 % runter-skaliert. Wenn selbst bei 50 %
  // kein Platz mehr ist (Kapitel-Titel füllt 6+ Zeilen), wird der Bruch
  // der Pagination-Engine überlassen.
  useEffect(() => {
    requestAnimationFrame(() => {
      const stack = stackRef.current;
      const fg = fgRef.current;
      if (!stack || !fg) return;
      const header = fg.querySelector(".a5-stack__fg > div:first-child") as HTMLElement | null;
      const isCandidate =
        imageSections.start.layout === "1-spaltig" &&
        imageSections.start.images.length === 2;
      if (!header || !isCandidate) {
        stack.style.setProperty("--a5-image-scale", "1");
        return;
      }
      const mmToPx = (mm: number) => (mm / 25.4) * 96;
      const cmToPx = (cm: number) => (cm / 2.54) * 96;
      const contentHeight = mmToPx(210) - 2 * cmToPx(2);
      const headerH = header.getBoundingClientRect().height;
      const contentWidth = mmToPx(148) - cmToPx(2) - cmToPx(2.5);
      // 2 Bilder × (Breite × 2/3 für 3:2) + 4mm Gap zwischen Reihen
      const oneImgHeight = (s: number) => contentWidth * s * (2 / 3);
      const stackedHeight = (s: number) => 2 * oneImgHeight(s) + mmToPx(4) + 2 * mmToPx(4);
      const available = contentHeight - headerH - 8; // 8px Sicherheitspuffer
      let scale = 1;
      if (stackedHeight(1) > available) {
        scale = Math.max(0.5, available / stackedHeight(1));
      }
      stack.style.setProperty("--a5-image-scale", scale.toFixed(3));
    });
  }, [title, imageSections.start.layout, imageSections.start.images.length, stackRef, fgRef]);

  const updateSection = (key: "start" | "end") => (next: ImageSections["start"]) => {
    setImageSections((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <div className="a5-desk [font-family:var(--font-lato)] flex min-h-[100dvh] flex-col">
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
              onUpload={uploadImageStub}
              onDelete={deleteImageStub}
            />
            <EditorContent editor={editor} />
            <ImageSection
              data={imageSections.end}
              onChange={updateSection("end")}
              onUpload={uploadImageStub}
              onDelete={deleteImageStub}
            />
          </div>
          {/* Seitenzahl-Overlay: über FG, damit Zahlen nicht von Bildern
              oder Text in der oberen rechten Ecke verdeckt werden. */}
          <div className="a5-stack__numbers" aria-hidden>
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                className="a5-page-number"
                style={{ top: `calc(${i} * (var(--a5-page-height) + var(--a5-page-gap)) + var(--a5-margin-top))` }}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-[#e0dcd5] bg-[#ece6df] px-4 py-2 sm:px-6">
        <WordCount words={wordCount} />
        <span className="text-xs text-[#a8a39b]">
          Auto-Speichern alle 2 Sekunden · A5-Format · Druck-Vorschau
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

    if (frameH <= 0 || topMarginPx + bottomMarginPx >= frameH) return;

    const stridePx = frameH + gapPx;
    const pageContentHeight = frameH - topMarginPx - bottomMarginPx;

    // Items in DOM-Reihenfolge sammeln.
    const breaks = Array.from(fg.querySelectorAll<HTMLElement>(".a5-page-break"));
    const editorBlocks = Array.from(
      fg.querySelectorAll<HTMLElement>(".tiptap-editor > *:not(.a5-page-break)"),
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
    }
    for (const el of breaks) {
      if (el.style.height) el.style.height = "";
    }
    // Layout nach Reset einmal erzwingen, damit die anschließenden
    // getBoundingClientRect-Aufrufe die natürlichen Positionen liefern.
    void fg.offsetHeight;

    const fgTop = fg.getBoundingClientRect().top;
    const inFgContent = (el: HTMLElement) => el.getBoundingClientRect().top - fgTop - topMarginPx;

    type Item = { el: HTMLElement; kind: "break" | "block" };
    const items: Item[] = [
      ...breaks.map<Item>((el) => ({ el, kind: "break" })),
      ...editorBlocks.map<Item>((el) => ({ el, kind: "block" })),
      ...imageRows.map<Item>((el) => ({ el, kind: "block" })),
    ];
    items.sort((a, b) => inFgContent(a.el) - inFgContent(b.el));

    for (const item of items) {
      const observedTop = inFgContent(item.el);
      const observedHeight = item.el.getBoundingClientRect().height;

      // Welche Seite trägt diesen Item-Top aktuell?
      const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
      const frameContentBottom = frameIdx * stridePx + pageContentHeight;
      const nextFrameContentTop = (frameIdx + 1) * stridePx;

      if (item.kind === "break") {
        // Page-Break: Höhe so setzen, dass der nächste Block am Content-Top
        // der Folgeseite ankommt.
        const currentHeight = item.el.getBoundingClientRect().height;
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
    const fgH = fg.getBoundingClientRect().height;
    const needed = Math.max(1, Math.ceil(fgH / stridePx));
    setPageCount((prev) => (prev !== needed ? needed : prev));
  }, [fgRef, stackRef]);

  // rAF-gebatcht: Single-Pass — der inkrementelle Algorithmus konvergiert
  // in einer Runde, weil wir Live-Werte lesen und nur Diffs anwenden.
  const schedule = useCallback(() => {
    if (rafRef.current !== null) return;
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

  // Trigger bei Title- oder Image-Section-Änderung
  useEffect(() => {
    schedule();
  }, [imageSectionsDeps, titleDep, schedule]);

  // Initialer Pass
  useEffect(() => {
    schedule();
  }, [schedule]);

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

// ---------------------------------------------------------------------------
// Stubs — werden in /backend (PROJ-5) durch echte Server Actions ersetzt
// ---------------------------------------------------------------------------

async function saveDraftStub(_draft: ChapterDraft): Promise<void> {
  await new Promise((r) => setTimeout(r, 600));
}

async function uploadImageStub(img: UploadedImage): Promise<ChapterImage> {
  await new Promise((r) => setTimeout(r, 400));
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toast.success("Bild hinzugefügt (lokal — Backend folgt in /backend).");
  return {
    id,
    storage_path: `local://${img.fileName}`,
    signed_url: img.previewUrl,
    alt: "",
  };
}

async function deleteImageStub(image: ChapterImage): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  if (image.signed_url.startsWith("blob:")) URL.revokeObjectURL(image.signed_url);
}

function estimateColorPages(s: ImageSections): number {
  const rows = (sec: ImageSections["start"]) =>
    Math.ceil(sec.images.length / (sec.layout === "2-spaltig" ? 2 : 1));
  const pagesPer = (rowCount: number) => Math.ceil(rowCount / 2);
  return pagesPer(rows(s.start)) + pagesPer(rows(s.end));
}
