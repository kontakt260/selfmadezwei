import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /api/stripe/webhook ausnehmen (PROJ-6 Backend):
    //   - Stripe sendet keine User-Session — Middleware-Auth-Check
    //     würde mit 302 statt 400 antworten.
    //   - Raw-Body darf NICHT vorgelesen werden, sonst schlägt die
    //     Stripe-Signatur-Verifikation fehl.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
