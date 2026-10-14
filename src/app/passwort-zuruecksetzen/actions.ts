"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(8, "Mindestens 8 Zeichen."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwörter stimmen nicht überein.",
  });

export type ResetPasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirmPassword", string>>;
};

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: ResetPasswordState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "password" | "confirmPassword";
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  // `has_password` merkt sich, dass dieses Konto jetzt (auch) ein Passwort
  // hat — relevant für per Google/Facebook angelegte Konten, siehe
  // src/lib/auth/has-password.ts.
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { has_password: true },
  });

  // Nicht jeder Fehler heißt „Link abgelaufen": Die Sitzung aus dem Link
  // ist bei diesen beiden noch gültig, die Person muss nur ein anderes
  // Passwort wählen.
  if (error?.code === "same_password") {
    return {
      fieldErrors: {
        password:
          "Dieses Passwort verwenden Sie bereits. Bitte wählen Sie ein anderes.",
      },
    };
  }
  if (error?.code === "weak_password") {
    return {
      fieldErrors: {
        password:
          "Dieses Passwort ist zu unsicher. Bitte wählen Sie ein längeres oder weniger gängiges.",
      },
    };
  }
  if (error) {
    return { error: "Link ungültig oder abgelaufen. Bitte fordern Sie einen neuen an." };
  }

  redirect("/");
}
