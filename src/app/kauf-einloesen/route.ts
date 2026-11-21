import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getStripe } from "@/lib/stripe/server";
import { CLAIM_COOKIE, CLAIM_LINK_COOKIE, parseClaimCookie } from "@/lib/purchases/claim-token";
import { claimGuestPurchases, type ClaimOutcome } from "@/lib/purchases/guest-purchase";

// Einlösen eines Kaufs ohne Konto (PROJ-6, 2026-11-16).
//
// Hierher kommt, wer nach dem Checkout ein Konto angelegt oder sich
// angemeldet hat: über die Erfolgsseite, über den Link in der Kauf-Mail
// oder automatisch, weil sein Konto noch kein Projekt hat (Middleware).
// Die Route ordnet offene Käufe dem angemeldeten Konto zu und leitet
// weiter — sie zeigt selbst nichts an.
//
// GET mit Schreibwirkung ist hier vertretbar: Eingelöst wird nur, was dem
// angemeldeten Konto ohnehin zusteht (bestätigte E-Mail-Adresse, Einlöse-
// Geheimnis aus dem eigenen Browser oder persönlicher Link aus der Kauf-Mail,
// den /kauf-zuordnen als Cookie abgelegt hat). Ein fremd ausgelöster Aufruf
// kann nichts anderes bewirken.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/anmelden?next=%2Fkauf-einloesen`);
  }

  const cookieStore = await cookies();
  const claimCookie = parseClaimCookie(cookieStore.get(CLAIM_COOKIE)?.value);
  const mailToken = cookieStore.get(CLAIM_LINK_COOKIE)?.value ?? null;

  let outcome: ClaimOutcome = {
    claimed: [],
    failed: 0,
    cookieSpent: false,
    mailLinkUnavailable: false,
  };
  try {
    outcome = await claimGuestPurchases(createServiceRoleClient(), {
      user: {
        id: user.id,
        email: user.email ?? null,
        emailConfirmed: !!user.email_confirmed_at,
      },
      cookie: claimCookie,
      mailToken,
      retrieveSession: (sessionId) => getStripe().checkout.sessions.retrieve(sessionId),
    });
  } catch (err) {
    // Technischer Fehler (Datenbank nicht erreichbar o. Ä.): nichts
    // einlösen, aber den Nutzer nicht in einer Fehlerseite stranden lassen.
    console.error(
      `[kauf-einloesen] claim failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    outcome = { claimed: [], failed: 1, cookieSpent: false, mailLinkUnavailable: false };
  }

  // Nichts einzulösen: Konten mit Projekt gehen zur Startseite (z. B.
  // Bestandskunden mit einem alten Einlöse-Cookie aus einem abgebrochenen
  // Kauf), Konten ohne Projekt zum Kauf-Assistenten. Dieselbe Abfrage wie
  // in der Middleware — RLS liefert nur die Projekte des Kontos.
  const { data: accessRows } = await supabase.from("project_access").select("project_id").limit(1);
  const hasProject = (accessRows ?? []).length > 0;

  let target = hasProject ? `${origin}/` : `${origin}/onboarding`;
  if (outcome.claimed.length > 0) {
    // Bestätigung für den (ersten) eingelösten Kauf zeigen.
    target = `${origin}/kauf-erfolgreich?session_id=${encodeURIComponent(outcome.claimed[0].stripeSessionId)}`;
  } else if (outcome.failed > 0 && !hasProject) {
    target = `${origin}/onboarding?kauf=nicht-zugeordnet`;
  } else if (outcome.mailLinkUnavailable) {
    // Link aus der Mail, aber sein Kauf ist schon zugeordnet: nicht wortlos
    // auf der Startseite landen.
    target = `${target}?kauf=link-verbraucht`;
  }

  const response = NextResponse.redirect(target);
  if (claimCookie && outcome.cookieSpent) {
    response.cookies.delete(CLAIM_COOKIE);
  }
  // Mail-Link verbraucht. Bei einem technischen Fehler bleibt er für den
  // nächsten Versuch liegen.
  if (mailToken && outcome.failed === 0) {
    response.cookies.delete({ name: CLAIM_LINK_COOKIE, path: "/kauf-einloesen" });
  }
  return response;
}
