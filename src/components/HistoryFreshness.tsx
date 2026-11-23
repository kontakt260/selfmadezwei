"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { isFreshDataRoute } from "@/lib/history-freshness";
import { hasPendingSaves, savesSettled } from "@/lib/pending-saves";

// PROJ-30: Für Zurück und Vorwärts hält Next.js eine Kopie jeder Seite bereit
// und fragt den Server nicht. Im Editor hat das neueren Text überschrieben.
// Hier wird deshalb nach jedem Schritt durch den Verlauf der aktuelle Stand
// geholt. Dasselbe gilt, wenn beim Seitenwechsel noch gespeichert wird: Die neue
// Seite könnte sonst den Stand von vor diesem Speichern zeigen. Bis der aktuelle
// Stand da ist, bleibt der Inhalt ausgeblendet und der Editor gesperrt.

const HistoryRefreshContext = createContext(false);

/** `true`, solange nach Zurück oder Vorwärts der aktuelle Stand noch fehlt. */
export function useHistoryRefreshPending(): boolean {
  return useContext(HistoryRefreshContext);
}

export function HistoryFreshness({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const beginRef = useRef<() => void>(() => undefined);
  const [isPending, startTransition] = useTransition();
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  const runRef = useRef(0);
  const refreshing = awaitingRefresh || isPending;

  useEffect(() => {
    const root = document.documentElement;
    let waitingForNetwork = false;

    const refresh = async (run: number) => {
      const saveFailed = await savesSettled();
      if (saveFailed) {
        toast.error(
          "Ihre letzte Änderung konnte nicht gespeichert werden. Bitte prüfen Sie den Inhalt.",
          { duration: 15_000 },
        );
      }
      if (run !== runRef.current) return;
      if (!navigator.onLine) {
        waitingForNetwork = true;
        return;
      }
      waitingForNetwork = false;
      startTransition(() => {
        setAwaitingRefresh(false);
        router.refresh();
      });
    };

    const begin = () => {
      const run = ++runRef.current;
      waitingForNetwork = false;
      if (!isFreshDataRoute(window.location.pathname)) {
        delete root.dataset.historyRefresh;
        setAwaitingRefresh(false);
        return;
      }
      // Direkt am Element, damit die alte Kopie gar nicht erst sichtbar wird.
      root.dataset.historyRefresh = "true";
      setAwaitingRefresh(true);
      // Erst nach dem Router, sonst würde die vorige Seite neu geladen.
      window.setTimeout(() => void refresh(run), 0);
    };

    beginRef.current = begin;

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) begin();
    };
    const onOnline = () => {
      if (waitingForNetwork) void refresh(runRef.current);
    };

    window.addEventListener("popstate", begin);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("popstate", begin);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  // Läuft nach den Aufräum-Effekten der alten Seite. Deren letztes Speichern ist
  // hier also schon gestartet.
  useEffect(() => {
    if (hasPendingSaves()) beginRef.current();
  }, [pathname]);

  useLayoutEffect(() => {
    if (!refreshing) delete document.documentElement.dataset.historyRefresh;
  }, [refreshing]);

  return (
    <HistoryRefreshContext.Provider value={refreshing}>
      {children}
      {refreshing ? (
        <p
          role="status"
          className="loading-delayed fixed left-1/2 top-1/2 z-[110] -translate-x-1/2 -translate-y-1/2 text-lg text-[#4A453F]"
        >
          Wird geladen …
        </p>
      ) : null}
    </HistoryRefreshContext.Provider>
  );
}

/**
 * Baut einen Editor neu auf, wenn der Server nach Zurück oder Vorwärts einen
 * anderen Stand liefert. Eigene Speichervorgänge lösen das nicht aus, sonst
 * ginge beim Tippen der Fokus verloren.
 */
export function FreshAfterHistory({
  version,
  children,
}: {
  version: string;
  children: ReactNode;
}) {
  const refreshing = useHistoryRefreshPending();
  const [tracked, setTracked] = useState({ mountKey: 0, baseline: version, refreshing });

  // Im Rendern statt im Effekt: So gibt es keinen Moment, in dem der alte
  // Editor schon entsperrt ist, der neue Stand aber noch nicht steht.
  if (tracked.refreshing !== refreshing || (!refreshing && tracked.baseline !== version)) {
    const changedDuringRefresh = tracked.refreshing && !refreshing && version !== tracked.baseline;
    setTracked({
      mountKey: changedDuringRefresh ? tracked.mountKey + 1 : tracked.mountKey,
      baseline: refreshing ? tracked.baseline : version,
      refreshing,
    });
  }

  return <Fragment key={tracked.mountKey}>{children}</Fragment>;
}
