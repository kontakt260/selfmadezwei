import "server-only";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { CLAIM_COOKIE, parseClaimCookie } from "./claim-token";
import { hasOpenClaimForEmail } from "./guest-purchase";

// Soll ein frisch angemeldetes Konto über /kauf-einloesen laufen?
//
// Ja, wenn der Browser ein Einlöse-Geheimnis trägt (er hat ohne Konto
// gekauft) oder zur bestätigten E-Mail-Adresse ein offener Kauf vorliegt.
// /kauf-einloesen prüft dann genau und leitet weiter. Diese Vorprüfung
// hält alle anderen Anmeldungen frei von dem Umweg.
//
// Wirft nie: Ein technischer Fehler darf keine Anmeldung blockieren.

type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

export async function hasPendingClaim(user: AuthUser): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    if (parseClaimCookie(cookieStore.get(CLAIM_COOKIE)?.value)) return true;
    return await hasOpenClaimForEmail(createServiceRoleClient(), {
      id: user.id,
      email: user.email ?? null,
      emailConfirmed: !!user.email_confirmed_at,
    });
  } catch (err) {
    console.error(
      `[purchases] pending-claim check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Ziele, die nach der Anmeldung „einfach in die App" bedeuten — nur dort
 * schalten wir das Einlösen dazwischen. Gezielte Ziele (Einladung,
 * Passwort-Reset …) bleiben unberührt.
 */
export function isDefaultLandingTarget(path: string): boolean {
  const pathname = path.split("?")[0];
  return pathname === "/" || pathname === "/onboarding";
}
