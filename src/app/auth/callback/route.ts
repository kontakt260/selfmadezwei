import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { maybeSendWelcomeMail } from "@/lib/email/send-welcome";

function safeNext(next: string | null): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
  }

  return NextResponse.redirect(`${origin}/anmelden?error=expired_link`);
}
