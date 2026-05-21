"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    fullName: z.string().min(2, "Bitte deinen vollständigen Namen angeben."),
    email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
    password: z.string().min(8, "Mindestens 8 Zeichen."),
    confirmPassword: z.string(),
    onboardingIntent: z.string().optional(),
    // PROJ-9: optionaler Redirect-Pfad nach erfolgreicher Email-Bestätigung
    // (z. B. zurück zur Einladungsseite).
    next: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwörter stimmen nicht überein.",
  });

// Sicherer next-Pfad: nur relative URLs erlaubt (gleicher Mechanismus wie
// in /anmelden), damit Open-Redirect-Vector ausgeschlossen ist.
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function getOnboardingRedirect(intent?: string): string {
  switch (intent?.toLowerCase()) {
    case "self":
    case "me":
    case "ich":
    case "fuer-mich":
    case "für-mich":
      return "/onboarding?for=self";
    case "gift":
    case "geschenk":
      return "/onboarding?for=gift";
    default:
      return "/onboarding";
  }
}

export type RegisterState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"fullName" | "email" | "password" | "confirmPassword", string>
  >;
};

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    onboardingIntent: formData.get("onboardingIntent"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const fieldErrors: RegisterState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<RegisterState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // PROJ-9: wenn `next` mitgeliefert wurde und sicher relativ ist, geht der
  // Post-Confirm-Redirect dorthin; sonst auf den Onboarding-Pfad.
  const safeNextPath = safeNext(parsed.data.next);
  const postConfirmTarget =
    safeNextPath ?? getOnboardingRedirect(parsed.data.onboardingIntent);

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(postConfirmTarget)}`,
    },
  });

  if (error) {
    return { error: "Registrierung fehlgeschlagen. Bitte versuche es erneut." };
  }

  // Supabase returns a user object with an empty `identities` array when the
  // email is already registered (security-preserving signal that does not leak
  // user existence over the network). See:
  // https://supabase.com/docs/reference/javascript/auth-signup
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return {
      fieldErrors: {
        email: "Diese E-Mail-Adresse ist bereits registriert.",
      },
    };
  }

  redirect("/email-bestaetigen");
}
