"use client";

import { useEffect, useRef, useState } from "react";
import type { BookFontId } from "@/lib/book-fonts";
import { loadHyphenation } from "@/lib/hyphenation";
import {
  pageCountQueueAction,
  typesetChapterAction,
  type TypesetChapter,
} from "@/app/projektuebersicht/[project_id]/page-count-actions";
import { chapterPageCountAction } from "@/app/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]/actions";
import { bookFontVariables } from "../bookFontFaces";
import { loadBookFont } from "../loadBookFont";
import { TypesetFrame } from "./TypesetFrame";

// PROJ-32 Schritt 3: Neusatz im Hintergrund. Nach einem Schriftwechsel gelten
// die Seitenzahlen der Kapitel als veraltet. Dieser Baustein holt die Liste vom
// Server, setzt ein Kapitel nach dem anderen unsichtbar und speichert nur die
// Seitenzahl, zusammen mit der Schrift, in der gemessen wurde. Der Trigger aus
// PROJ-7 rechnet daraus die Startseiten neu.
//
// - Er startet im Browser der Person, die gewechselt hat, und läuft weiter, wenn
//   ein Mitglied Projektübersicht oder Editor öffnet.
// - Wechselt die Schrift währenddessen erneut, verfallen ältere Ergebnisse: Der
//   Server nimmt sie nicht an, die Liste wird mit der neuen Schrift neu geholt.
// - Hat jemand ein Kapitel inzwischen geändert, wird nichts gespeichert, und es
//   kommt in der nächsten Runde erneut dran.
// - In einem verdeckten Tab wartet er, bis der Tab wieder sichtbar ist.

export type TypesetResult = "done" | "failed";

const MAX_ROUNDS = 6;
const MAX_ATTEMPTS = 2;

type Job = { key: string; chapter: TypesetChapter; font: BookFontId; resolve: (pages: number | null) => void };

function whenVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/** Zwischen zwei Kapiteln kurz Luft lassen, damit Eingaben im Editor nicht stocken. */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export default function BackgroundTypesetter({
  projectId,
  excludeChapterId,
  onProgress,
  onFinished,
}: {
  projectId: string;
  /** Kapitel, das gerade im Editor offen ist. Es misst sich selbst. */
  excludeChapterId?: string;
  onProgress?: (done: number, total: number) => void;
  onFinished?: (result: TypesetResult) => void;
}) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const [job, setJob] = useState<Job | null>(null);
  const callbacks = useRef({ onProgress, onFinished });
  useEffect(() => {
    callbacks.current = { onProgress, onFinished };
  }, [onProgress, onFinished]);

  useEffect(() => {
    let cancelled = false;
    const finish = (result: TypesetResult) => {
      if (!cancelled) callbacks.current.onFinished?.(result);
    };
    const measure = (chapter: TypesetChapter, font: BookFontId, key: string) =>
      new Promise<number | null>((resolve) => setJob({ key, chapter, font, resolve }));

    void (async () => {
      const attempts = new Map<string, number>();
      const failed = (id: string) => attempts.set(id, (attempts.get(id) ?? 0) + 1);
      let done = 0;
      await loadHyphenation();

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (cancelled) return;
        const { queue } = await pageCountQueueAction({ projectId }).catch(() => ({ queue: undefined }));
        if (cancelled) return;
        if (!queue) return finish("failed");
        const font = queue.bookFont;
        const ids = queue.chapterIds.filter(
          (id) => id !== excludeChapterId && (attempts.get(id) ?? 0) < MAX_ATTEMPTS,
        );
        if (ids.length === 0) {
          const left = queue.chapterIds.some((id) => id !== excludeChapterId);
          return finish(left ? "failed" : "done");
        }
        const total = done + ids.length;
        callbacks.current.onProgress?.(done, total);

        const scope = scopeRef.current;
        // AC-18: Ohne die richtige Schrift wird keine Seitenzahl gespeichert.
        if (!scope || !(await loadBookFont(font, scope))) return finish("failed");

        for (const id of ids) {
          await whenVisible();
          await idle();
          if (cancelled) return;
          const loaded = await typesetChapterAction({ projectId, chapterId: id }).catch(() => ({ chapter: undefined }));
          if (cancelled) return;
          if (!loaded.chapter) {
            failed(id);
            continue;
          }
          const chapter = loaded.chapter;
          const pages = await measure(chapter, font, `${round}:${id}`);
          if (cancelled) return;
          setJob(null);
          if (pages === null) {
            failed(id);
            continue;
          }
          const saved = await chapterPageCountAction({
            projectId,
            chapterId: id,
            pageCount: pages,
            pageCountFont: font,
            ifUnchangedSince: chapter.updatedAt,
          }).catch(() => ({ error: "offline", bookFont: undefined }));
          if (cancelled) return;
          // Die Schrift wurde inzwischen wieder gewechselt: Liste neu holen.
          if (saved.bookFont && saved.bookFont !== font) break;
          if (saved.error) {
            failed(id);
            continue;
          }
          done += 1;
          callbacks.current.onProgress?.(done, total);
        }
      }
      finish("failed");
    })();

    return () => {
      cancelled = true;
      setJob(null);
    };
  }, [projectId, excludeChapterId]);

  return (
    <div
      ref={scopeRef}
      aria-hidden
      data-testid="background-typesetter"
      // Unsichtbar, aber gesetzt: Der Seiten-Takt misst echte Zeilen. Zoom 1 wie im Druck.
      className={`${bookFontVariables} pointer-events-none fixed left-[-20000px] top-0 [visibility:hidden]`}
      style={{ ["--ui-zoom" as string]: "1" }}
    >
      {job && <TypesetFrame key={job.key} chapter={job.chapter} font={job.font} onMeasured={job.resolve} />}
    </div>
  );
}
