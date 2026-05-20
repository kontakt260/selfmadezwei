import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const PUBLIC_ROUTES = [
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/email-bestaetigen",
  "/onboarding",
  "/zugang-abgelaufen",
  // Konto-Bereich umgeht die „kein-Projekt → Onboarding"-Weiterleitung,
  // damit Nutzer ihr Konto auch nach Projekt-Löschung erreichen können.
  // Die Seite selbst (page.tsx) erzwingt weiterhin Login.
  "/persoenlicher-bereich",
];

const AUTH_ONLY_ROUTES = ["/anmelden", "/registrieren"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false;
  if (pathname.startsWith("/auth/")) return true;
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/anmelden";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic(pathname)) {
    const { data: projects } = await supabase
      .from("projects")
      .select("portal_access_expires_at")
      .limit(50);

    const now = Date.now();
    const hasNeverPaid = !projects || projects.every((p) => p.portal_access_expires_at === null);
    const allExpired =
      projects &&
      projects.length > 0 &&
      projects.every(
        (p) => p.portal_access_expires_at && new Date(p.portal_access_expires_at).getTime() < now,
      );

    if (hasNeverPaid) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
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
