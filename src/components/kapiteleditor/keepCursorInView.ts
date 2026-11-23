"use client";

import { type Editor } from "@tiptap/react";

// Word-/Docs-Verhalten: nach jeder Editor-Doc-Mutation schauen, ob der
// Cursor noch sichtbar ist. Wenn nicht (z. B. weil die Pagination-Engine
// einen Spacer eingefügt hat und den Cursor unter den Sticky-Toolbar/über
// den Viewport-Boden geschoben hat), Viewport sanft so verschieben, dass
// der Cursor wieder bequem im Lesebereich landet. Greift NICHT, wenn der
// User in einer Bild-Sektion arbeitet — die hat keinen Editor-Cursor.
let cursorFollowTimer: ReturnType<typeof setTimeout> | null = null;

export function keepCursorInView(editor: Editor) {
  const check = () => {
    try {
      if (editor.isDestroyed) return;
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
  };
  // Auf dem übernächsten Frame messen (Soft-Break-Spacer sind dann gesetzt).
  requestAnimationFrame(() => {
    requestAnimationFrame(check);
  });
  // Nachlauf: Die Pagination konvergiert über mehrere Frames (Höhe eines
  // manuellen Seitenumbruchs, Folge-Pass der Soft-Breaks, neue Seiten-
  // Frames). Der Cursor kann danach noch einmal deutlich wandern — z. B.
  // springt er nach „Seitenumbruch einfügen" am Dokumentende auf die neue
  // Seite, die beim ersten Messen noch gar nicht existierte (Bug
  // 2026-11-16: Cursor landete außerhalb des sichtbaren Bereichs).
  if (cursorFollowTimer) clearTimeout(cursorFollowTimer);
  cursorFollowTimer = setTimeout(() => {
    cursorFollowTimer = null;
    check();
  }, 350);
}
