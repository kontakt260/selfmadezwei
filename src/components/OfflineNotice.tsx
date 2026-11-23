"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isFreshDataRoute } from "@/lib/history-freshness";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// PROJ-30: Ohne Verbindung würde ein Klick auf einen Link auf der Fehlerseite
// des Browsers enden. Die aktuelle Seite bleibt deshalb stehen.
export function OfflineNotice() {
  const pathname = usePathname() ?? "";
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const active = !online && isFreshDataRoute(pathname);

  useEffect(() => {
    if (!active) return;
    const holdInternalLinks = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.origin !== window.location.origin || link.target === "_blank" || link.download) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", holdInternalLinks, true);
    return () => document.removeEventListener("click", holdInternalLinks, true);
  }, [active]);

  if (!active) return null;

  return (
    <Alert
      role="alert"
      className="fixed inset-x-0 bottom-0 z-[120] rounded-none border-x-0 border-b-0 border-t-2 border-[#8E877E] bg-white px-4 py-4 sm:px-6"
    >
      <AlertDescription className="text-lg leading-7 text-[#3E3831]">
        Sie sind gerade nicht mit dem Internet verbunden. Bitte prüfen Sie Ihre Verbindung und
        versuchen Sie es erneut.
      </AlertDescription>
    </Alert>
  );
}
