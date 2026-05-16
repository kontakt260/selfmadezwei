"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
});

export type ForgotPasswordState = {
  success?: boolean;
  fieldErrors?: { email?: string };
};

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      fieldErrors: { email: parsed.error.issues[0]?.message },
    };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Fire-and-forget: we intentionally don't surface whether the email exists
  // to prevent user enumeration.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/passwort-zuruecksetzen`,
  });

  return { success: true };
}
