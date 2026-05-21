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
  message = "Kauf nicht abgeschlossen — du kannst es erneut versuchen.",
}: {
  message?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("checkout") !== "cancelled") return;
    toast.info(message, { duration: 6000 });
    // Query-Parameter wegputzen, damit Reload nicht erneut feuert.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("checkout");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, message]);

  return null;
}
