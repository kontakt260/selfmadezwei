"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

// Liest `?checkout=cancelled` aus der URL und zeigt einen Toast an.
// Wird nach dem ersten Render einmalig getriggert; der Query-Parameter
// wird danach aus der URL entfernt (history.replaceState), damit ein
// Reload nicht erneut den Toast auslöst.
//
// PROJ-6 Frontend-Phase: wird in /backend an die echten Stripe-
// `cancel_url`-Targets gehängt — bisher kein realer Stripe-Flow, das
// Snippet ist aber bereits aktiv und idle (keine Wirkung ohne den
// Query-Parameter).

export function CheckoutCancelToast({
  message = "Kauf nicht abgeschlossen — Sie können es erneut versuchen.",
}: {
  message?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const cancelled = searchParams.get("checkout") === "cancelled";
    // `?kauf=nicht-zugeordnet` setzt /kauf-einloesen, wenn eine Zahlung
    // gefunden wurde, die Zuordnung zum Konto aber technisch scheiterte.
    const unassigned = searchParams.get("kauf") === "nicht-zugeordnet";
    // `?kauf=link-verbraucht`: Der Link aus der Kauf-Mail wurde geöffnet, der
    // Kauf gehört aber schon zu einem Konto.
    const linkUsed = searchParams.get("kauf") === "link-verbraucht";
    if (!cancelled && !unassigned && !linkUsed) return;
    if (cancelled) toast.info(message, { duration: 6000 });
    if (unassigned) {
      toast.error(
        "Ihre Zahlung ist eingegangen, konnte Ihrem Konto aber noch nicht zugeordnet werden. Bitte laden Sie die Seite in einer Minute neu oder schreiben Sie uns an kontakt@narravit.de.",
        { duration: 15000 },
      );
    }
    if (linkUsed) {
      toast.info(
        "Dieser Kauf wurde bereits einem Konto zugeordnet. Falls Sie ihn hier nicht sehen, melden Sie sich mit dem anderen Konto an oder schreiben Sie uns an kontakt@narravit.de.",
        { id: "kauf-link-verbraucht", duration: 15000 },
      );
    }
    // Query-Parameter wegputzen, damit Reload nicht erneut feuert.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("checkout");
    next.delete("kauf");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, message]);

  return null;
}
