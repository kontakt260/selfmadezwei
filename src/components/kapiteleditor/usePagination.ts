"use client";

import { useEffect, useRef, useState } from "react";
import { type Editor } from "@tiptap/react";
import { type ImageSections } from "@/lib/kapiteleditor/types";
import { createPageLayoutClock, type PageLayoutClock } from "./pageLayoutClock";
import { connectPageLayout } from "./tiptap/PaginationDecorations";

type PaginationDeps = {
  editor: Editor | null;
  stackRef: React.RefObject<HTMLDivElement | null>;
  fgRef: React.RefObject<HTMLDivElement | null>;
  imageSectionsDeps: ImageSections;
  titleDep: string;
  initialPageCount: number;
};

export function usePagination({
  editor,
  stackRef,
  fgRef,
  imageSectionsDeps,
  titleDep,
  initialPageCount,
}: PaginationDeps) {
  // PROJ-30: Start mit der gespeicherten Zahl. Ohne sichtbares Layout (Phone)
  // bleibt sie stehen, statt als 1 gemessen und gespeichert zu werden.
  // PROJ-32: Zur Zahl gehört die Schrift, mit der sie gemessen wurde. Die
  // gespeicherte Zahl hat hier keine (`null`), sie wird nie erneut gespeichert.
  const [measured, setMeasured] = useState<{ pages: number; fontKey: string | null }>({
    pages: initialPageCount,
    fontKey: null,
  });
  const clockRef = useRef<PageLayoutClock | null>(null);

  // PROJ-25: Alle Auslöser laufen im Seiten-Takt zusammen (siehe
  // pageLayoutClock.ts). Textänderungen meldet das Plugin in
  // PaginationDecorations. Es gibt keine festen Wartezeiten mehr: Gerechnet wird
  // nur, wenn sich wirklich etwas geändert hat.
  useEffect(() => {
    const fg = fgRef.current;
    const stack = stackRef.current;
    if (!editor || !fg || !stack) return;

    const storage = editor.storage.paginationDecorations;
    const size = () => `${fg.offsetWidth}x${fg.offsetHeight}`;
    let settledSize = "";
    const clock = createPageLayoutClock({
      isVisible: () => fg.getClientRects().length > 0,
      layout: () =>
        storage.runLayout?.((pages, fontKey) =>
          setMeasured((prev) =>
            prev.pages === pages && prev.fontKey === fontKey ? prev : { pages, fontKey },
          ),
        ),
      onSettled: () => {
        settledSize = size();
      },
    });
    clockRef.current = clock;
    connectPageLayout(storage, clock.request);

    // Größenänderungen von außen. Die eigene Berechnung löst keinen neuen Lauf aus.
    const resizeObserver = new ResizeObserver(() => {
      if (size() !== settledSize) clock.request();
    });
    resizeObserver.observe(fg);
    window.addEventListener("resize", clock.request);

    // `load` und `error` steigen nicht auf, in der Capture-Phase kommen sie aber
    // auch von Bildern an, die erst später eingefügt werden.
    fg.addEventListener("load", clock.request, true);
    fg.addEventListener("error", clock.request, true);

    // Spätere Schriften ändern die Zeilenumbrüche.
    const fonts = document.fonts;
    fonts.addEventListener("loadingdone", clock.request);
    void fonts.ready.then(clock.request);

    clock.request();

    return () => {
      clock.destroy();
      clockRef.current = null;
      connectPageLayout(storage, null);
      resizeObserver.disconnect();
      window.removeEventListener("resize", clock.request);
      fg.removeEventListener("load", clock.request, true);
      fg.removeEventListener("error", clock.request, true);
      fonts.removeEventListener("loadingdone", clock.request);
    };
  }, [editor, fgRef, stackRef]);

  // Titel und Bilder ändern das Layout, ohne dass sich der Text ändert.
  useEffect(() => {
    clockRef.current?.request();
  }, [imageSectionsDeps, titleDep]);

  return { pageCount: measured.pages, pageCountFontKey: measured.fontKey };
}
