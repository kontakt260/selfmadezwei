"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type Editor } from "@tiptap/react";
import { type ImageSections } from "@/lib/kapiteleditor/types";
import { recalcPagination } from "./paginationPasses";

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
  const [pageCount, setPageCount] = useState(initialPageCount);
  const rafRef = useRef<number | null>(null);

  const recalc = useCallback(() => {
    const fg = fgRef.current;
    const stack = stackRef.current;
    if (!fg || !stack) return;
    recalcPagination(fg, stack, setPageCount);
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
  //
  // BugFix 2026-05-21 (Cursor-Spin nach Leeren-Absatz-Lösch): PD
  // (PaginationDecorations) entfernt+setzt bei jedem `recompute` alle
  // Spacer-Widgets neu (clear + re-add für saubere Messung). Das löst
  // childList-Mutationen aus, die hier einen schedule() triggern → recalc()
  // → ggf. weitere DOM-Mutation → MO feuert wieder → Loop. Wir filtern
  // Spacer-only-Mutationen raus; PD informiert uns selbst via
  // `narravit:pagination-recompute`-Event, wenn die Spacer-Konfiguration
  // semantisch geändert hat (Signature-Compare in PD).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const isSpacerOnly = (n: Node): boolean =>
      n instanceof HTMLElement &&
      (n.classList.contains("a5-soft-break-spacer") ||
        n.classList.contains("a5-block-push-spacer"));
    const mo = new MutationObserver((records) => {
      const meaningful = records.some((rec) => {
        for (const n of rec.addedNodes) if (!isSpacerOnly(n)) return true;
        for (const n of rec.removedNodes) if (!isSpacerOnly(n)) return true;
        return false;
      });
      if (meaningful) schedule();
    });
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
