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
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwörter stimmen nicht überein.",
  });

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

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return {
        fieldErrors: {
          email: "Diese E-Mail-Adresse ist bereits registriert.",
        },
      };
    }
    return { error: "Registrierung fehlgeschlagen. Bitte versuche es erneut." };
  }

  redirect("/email-bestaetigen");
}
