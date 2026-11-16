import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const PUBLIC_ROUTES = [
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/email-bestaetigen",
  // Kauf ohne Konto (2026-11-16): /onboarding und /kauf-erfolgreich sind
  // wieder öffentlich — wer auf der Landingpage „Jetzt kaufen" klickt,
  // geht direkt durch den Checkout und legt sein Konto erst danach an.
  // Die frühere Sperre (Vibe-Security-Audit 2026-05-16, Finding #5)
  // sollte verhindern, dass eine Zahlung ohne `user_id` niemandem
  // zugeordnet werden kann. Das löst jetzt der Einlöse-Weg: Gast-Käufe
  // landen in `purchase_claims` und werden nach der Anmeldung über
  // /kauf-einloesen dem Konto zugeordnet.
  "/onboarding",
  "/kauf-erfolgreich",
  "/zugang-abgelaufen",
  // Konto-Bereich umgeht die „kein-Projekt → Onboarding"-Weiterleitung,
  // damit Nutzer ihr Konto auch nach Projekt-Löschung erreichen können.
  // Die Seite selbst (page.tsx) erzwingt weiterhin Login.
  "/persoenlicher-bereich",
  // PROJ-9: Accept-Page ist Token-authentifiziert (Token IS das Geheimnis).
  // Anonyme User müssen die Vorschau sehen können, um sich danach mit der
  // korrekten E-Mail anzumelden/registrieren.
  "/einladung",
];

const AUTH_ONLY_ROUTES = ["/anmelden", "/registrieren"];

// Routen, die für eingeloggte User immer erreichbar sind, OHNE die
// „kein-Projekt → /onboarding"-Weiterleitung auszulösen. Sonst entsteht
// ein Loop: /onboarding selbst löst die Weiterleitung auf /onboarding
// aus, und /kauf-erfolgreich kann zwischen Stripe-Redirect und Webhook-
// Eintreffen kurz „kein Projekt" sein.
// PROJ-9: /einladung gehört dazu, sonst kollidiert die „kein-Projekt →
// /onboarding"-Weiterleitung mit dem Accept-Flow für frisch registrierte
// Eingeladene (haben per Definition noch kein Projekt).
// /kauf-einloesen ordnet einen Kauf ohne Konto zu — dort gibt es per
// Definition noch kein Projekt.
const NO_PAYMENT_BYPASS = ["/onboarding", "/kauf-erfolgreich", "/kauf-einloesen", "/einladung"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false;
  if (pathname.startsWith("/auth/")) return true;
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// Sicheres Weiterleitungsziel aus `?next=`: nur Pfade der eigenen Seite
// (kein Open Redirect). Neben `//host` muss auch `/\host` abgewiesen
// werden — der URL-Parser liest Backslashes wie Schrägstriche. Zusätzlich
// wird das Ergebnis gegen den eigenen Origin geprüft.
function safeNextPath(next: string | null, origin: string): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\\\u0000-\u001f]/.test(next)) return null;
  try {
    if (new URL(next, origin).origin !== origin) return null;
  } catch {
    return null;
  }
  return next;
}

function bypassesPaymentCheck(pathname: string): boolean {
  return NO_PAYMENT_BYPASS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user && isAuthOnly(pathname)) {
    // Schon angemeldet: direkt zum gewünschten Ziel (z. B. /kauf-einloesen
    // aus der Kauf-Mail), sonst zur Startseite.
    const { origin } = request.nextUrl;
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), origin);
    const target = next && !isAuthOnly(next.split("?")[0]) ? next : "/";
    return NextResponse.redirect(new URL(target, origin));
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/anmelden";
    // /kauf-einloesen: nach der Anmeldung dorthin zurück, damit der Kauf
    // zugeordnet wird.
    if (pathname === "/kauf-einloesen") {
      url.search = "";
      url.searchParams.set("next", "/kauf-einloesen");
    }
    return NextResponse.redirect(url);
  }

  if (user && !isPublic(pathname) && !bypassesPaymentCheck(pathname)) {
    // PROJ-6 Paywall-Lockdown: expires_at liegt nicht mehr in `projects`
    // (das wäre client-UPDATE-bar gewesen), sondern in der strikt
    // service_role-write-only `project_access`-Tabelle. RLS-SELECT-Policy
    // filtert automatisch auf Projekte des eingeloggten Users.
    const { data: accessRows } = await supabase
      .from("project_access")
      .select("expires_at")
      .limit(50);

    const now = Date.now();
    const hasNeverPaid =
      !accessRows ||
      accessRows.length === 0 ||
      accessRows.every((r) => r.expires_at === null);
    const allExpired =
      !!accessRows &&
      accessRows.length > 0 &&
      accessRows.every(
        (r) => r.expires_at && new Date(r.expires_at).getTime() < now,
      );

    if (hasNeverPaid) {
      // Kein Projekt: erst prüfen, ob ein Kauf ohne Konto auf dieses Konto
      // wartet. /kauf-einloesen löst ihn ein oder leitet — wenn es keinen
      // gibt — zum Kauf-Assistenten (/onboarding) weiter.
      const url = request.nextUrl.clone();
      url.pathname = "/kauf-einloesen";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (allExpired) {
      const url = request.nextUrl.clone();
      url.pathname = "/zugang-abgelaufen";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
