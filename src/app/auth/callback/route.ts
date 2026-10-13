import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { maybeSendWelcomeMail } from "@/lib/email/send-welcome";

function safeNext(next: string | null): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}

// Link-Typen aus unseren Supabase-Mail-Vorlagen (supabase/templates/),
// die per Token-Hash bestätigt werden dürfen.
const EMAIL_LINK_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "email",
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
]);

// Zwei Wege führen hierher:
//
//   1. `token_hash` + `type` — Links aus unseren Mail-Vorlagen. Der Token
//      steckt im Link selbst und wird serverseitig bestätigt. Funktioniert
//      in jedem Browser und auf jedem Gerät.
//   2. `code` — OAuth-Login (Google/Facebook) und ältere Mail-Links. Der
//      Code lässt sich nur in dem Browser einlösen, der den Vorgang
//      gestartet hat (PKCE-Verifier liegt dort im Cookie).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();
  let authenticated = false;

  if (tokenHash && type && EMAIL_LINK_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    authenticated = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authenticated = !error;
  }

  if (authenticated) {
    // PROJ-11: Welcome-Mail fire-and-forget. Wird nur verschickt, wenn
    // (a) der User verifiziert ist UND (b) noch kein mail_log-Eintrag
    // „welcome" für diese user_id existiert (Idempotenz via UNIQUE-
    // Constraint in mail_log).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && user.email && user.email_confirmed_at) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      void maybeSendWelcomeMail({
        to: user.email,
        userId: user.id,
        fullName: profile?.full_name ?? undefined,
      });
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Bei einem fehlgeschlagenen Passwort-Link bieten wir auf der
  // Anmeldeseite einen neuen Reset-Link an statt einer neuen
  // Bestätigungs-Mail.
  const isRecovery =
    type === "recovery" || next.startsWith("/passwort-zuruecksetzen");
  return NextResponse.redirect(
    `${origin}/anmelden?error=expired_link${isRecovery ? "&flow=recovery" : ""}`,
  );
}
