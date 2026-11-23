"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  LoadingView,
  loadingViewKind,
  type LoadingViewKind,
} from "@/components/loading/LoadingViews";

// PROJ-30: Die Ladeansicht erscheint nur, wenn die nächste Seite wirklich auf
// sich warten lässt. Antwortet der Server schnell, wechselt die Seite direkt.
// Erscheint sie doch, bleibt sie kurz stehen, damit sie nicht nur aufblitzt.
// Die bisherige Seite bleibt dahinter im Layout, sonst ginge die Scroll-Position
// für die Zurück-Taste verloren.
const LOADING_VIEW_DELAY_MS = 180;
const LOADING_VIEW_MIN_MS = 250;
// Sicherung, falls eine Navigation ohne Seitenwechsel endet.
const LOADING_VIEW_MAX_MS = 20_000;

type View = { kind: LoadingViewKind; shownAt: number };

export function NavigationFeedback({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const delayTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const maxTimer = useRef<number | null>(null);
  const pathChangeRef = useRef<() => void>(() => undefined);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const clear = (timer: { current: number | null }) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clear(hideTimer);
      clear(maxTimer);
      viewRef.current = null;
      setView(null);
    };
    const show = (kind: LoadingViewKind) => {
      const next = { kind, shownAt: viewRef.current?.shownAt ?? performance.now() };
      viewRef.current = next;
      setView(next);
      clear(maxTimer);
      maxTimer.current = window.setTimeout(hide, LOADING_VIEW_MAX_MS);
    };

    // In der Bubble-Phase: `defaultPrevented` zeigt, dass next/link die
    // Navigation übernommen hat. Neuer Tab und Downloads bleiben außen vor.
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.origin !== window.location.origin || link.target === "_blank") return;
      const from = window.location.pathname;
      if (link.pathname === from) return;
      clear(delayTimer);
      clear(hideTimer);
      const kind = loadingViewKind(link.pathname);
      if (!kind) {
        if (viewRef.current) hide();
        return;
      }
      if (viewRef.current) {
        show(kind);
        return;
      }
      delayTimer.current = window.setTimeout(() => {
        delayTimer.current = null;
        if (window.location.pathname === from) show(kind);
      }, LOADING_VIEW_DELAY_MS);
    };

    const onPathChange = () => {
      clear(delayTimer);
      clear(hideTimer);
      const current = viewRef.current;
      if (!current) return;
      const remaining = current.shownAt + LOADING_VIEW_MIN_MS - performance.now();
      hideTimer.current = window.setTimeout(hide, Math.max(0, remaining));
    };
    pathChangeRef.current = onPathChange;

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clear(delayTimer);
      clear(hideTimer);
      clear(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    pathChangeRef.current();
  }, [pathname]);

  return (
    <>
      <div inert={!!view} className={view ? "invisible contents" : "contents"}>
        {children}
      </div>
      {view ? (
        <div className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-[#FAF8F6]">
          <LoadingView kind={view.kind} />
        </div>
      ) : null}
    </>
  );
}
