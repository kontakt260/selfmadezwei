import { NextResponse, type NextRequest } from "next/server";
import {
  CLAIM_LINK_COOKIE,
  CLAIM_LINK_COOKIE_MAX_AGE_SECONDS,
  isClaimToken,
} from "@/lib/purchases/claim-token";

// Persönlicher Link aus der Kauf-Mail (PROJ-6, BUG-G12).
//
// Die Mail geht an die Adresse aus dem Checkout. Wer den Link hat, darf den
// Kauf deshalb jedem eigenen Konto zuordnen — auch unter anderer Adresse und
// auf einem anderen Gerät.
//
// Die Route ordnet selbst nichts zu: Sie legt das Geheimnis in ein
// httpOnly-Cookie und leitet auf eine saubere URL weiter. Mail-Scanner, die
// Links vorab aufrufen, lösen dadurch nichts aus, und das Geheimnis bleibt
// nicht in Adressleiste oder Verlauf. Eingelöst wird nach der Anmeldung auf
// /kauf-einloesen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const page = searchParams.get("ziel") === "anmelden" ? "anmelden" : "registrieren";

  const response = NextResponse.redirect(`${origin}/${page}?next=%2Fkauf-einloesen`);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  const code = searchParams.get("code");
  if (isClaimToken(code)) {
    response.cookies.set(CLAIM_LINK_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Nur die Einlöse-Route bekommt das Geheimnis zu sehen.
      path: "/kauf-einloesen",
      maxAge: CLAIM_LINK_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}
