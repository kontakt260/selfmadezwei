"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { BookFontId } from "@/lib/book-fonts";
import { getImageSection } from "@/lib/kapiteleditor/image-sections";
import type { TypesetChapter } from "@/app/projektuebersicht/[project_id]/page-count-actions";
import { editorExtensions } from "../tiptap/extensions";
import { EDITOR_PROPS } from "../editorProps";
import { FirstPageHeader } from "../FirstPageTemplate";
import { ImageSectionsProvider, type ImageSectionsApi } from "../ImageSectionsContext";
import { bookFontStyle } from "../loadBookFont";
import { usePagination } from "../usePagination";

// PROJ-32 Schritt 3: Setzt ein Kapitel unsichtbar genau wie der Editor: dieselbe
// A5-Seite, dieselben Erweiterungen (Silbentrennung, Seitenregeln, Bildreihen),
// derselbe Seiten-Takt. Meldet die Seitenzahl, sobald der Satz ruhig ist.

/** So lange muss die Seitenzahl gleich bleiben, dann gilt der Satz als fertig. */
const SETTLE_MS = 150;
/** Kommt bis dahin keine Messung, gilt das Kapitel als nicht setzbar. */
const GIVE_UP_MS = 15_000;

const noop = () => {};
const refuse = () => Promise.reject(new Error("Neusatz ist nur lesend."));

export function TypesetFrame({
  chapter,
  font,
  onMeasured,
}: {
  chapter: TypesetChapter;
  font: BookFontId;
  /** Seitenzahl, oder `null`, wenn das Kapitel nicht gesetzt werden konnte. */
  onMeasured: (pages: number | null) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: (chapter.body as object | null) ?? undefined,
    editable: false,
    editorProps: EDITOR_PROPS,
    immediatelyRender: false,
  });

  const { pageCount, pageCountFontKey } = usePagination({
    editor,
    stackRef,
    fgRef,
    imageSectionsDeps: chapter.imageSections,
    titleDep: chapter.title,
    initialPageCount: 1,
  });

  // Wie im Lesemodus: Bildabschnitte nur anzeigen. Fotos müssen nicht laden,
  // die Bildplätze haben feste Seitenverhältnisse.
  const imageApi = useMemo<ImageSectionsApi>(
    () => ({
      sectionById: (id) => getImageSection(chapter.imageSections, id),
      readOnly: true,
      zoom: 1,
      freshLinks: {},
      canAddPhoto: () => false,
      changeSection: noop,
      uploadPhoto: refuse,
      deletePhoto: refuse,
      removeSection: noop,
      onPhotoError: noop,
    }),
    [chapter.imageSections],
  );

  useEffect(() => {
    if (reported.current || pageCountFontKey !== font) return;
    const timer = setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      onMeasured(pageCount);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pageCount, pageCountFontKey, font, onMeasured]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const giveUp = () => {
      if (reported.current) return;
      // In einem verdeckten Tab steht der Seiten-Takt still, das ist kein Fehler.
      if (document.hidden) {
        timer = setTimeout(giveUp, GIVE_UP_MS);
        return;
      }
      reported.current = true;
      onMeasured(null);
    };
    timer = setTimeout(giveUp, GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [onMeasured]);

  return (
    <div
      className="a5-stack"
      data-book-font={font}
      data-font-ready="1"
      ref={stackRef}
      style={bookFontStyle(font)}
    >
      <div className="a5-stack__fg" ref={fgRef}>
        <FirstPageHeader title={chapter.title} />
        <ImageSectionsProvider value={imageApi}>
          <EditorContent editor={editor} />
        </ImageSectionsProvider>
      </div>
    </div>
  );
}
