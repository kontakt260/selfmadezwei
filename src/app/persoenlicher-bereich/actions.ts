"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// ─── Update Name ────────────────────────────────────────────────────────────

const nameSchema = z.object({
  name: z
    .string()
    .min(2, "Name muss mindestens 2 Zeichen haben.")
    .max(100, "Name darf maximal 100 Zeichen haben."),
});

export type UpdateNameState = { success?: boolean; error?: string };

export async function updateNameAction(
  _prev: UpdateNameState,
  formData: FormData,
): Promise<UpdateNameState> {
  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.name })
    .eq("id", user.id);

  if (error) return { error: "Name konnte nicht gespeichert werden." };
  return { success: true };
}

// ─── Reset Password ──────────────────────────────────────────────────────────

export type ResetPasswordState = { success?: boolean; error?: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  _formData: FormData,
): Promise<ResetPasswordState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Nicht angemeldet." };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${origin}/auth/callback?next=/passwort-zuruecksetzen`,
  });

  if (error) return { error: "Zurücksetzen fehlgeschlagen. Bitte versuche es erneut." };
  return { success: true };
}

// ─── Delete Account ──────────────────────────────────────────────────────────

export type DeleteAccountState = {
  success?: boolean;
  error?: string;
  soleOwnerCount?: number;
};

export async function deleteAccountAction(
  _prev: DeleteAccountState,
  _formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Check if user is the sole owner on any project
  const { data: ownedMemberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("role", "projektleiter");

  let soleOwnerCount = 0;
  if (ownedMemberships && ownedMemberships.length > 0) {
    for (const { project_id } of ownedMemberships) {
      const { count } = await supabase
        .from("project_members")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project_id)
        .eq("role", "projektleiter");
      if (count === 1) soleOwnerCount++;
    }
  }

  if (soleOwnerCount > 0) {
    return { error: "sole_owner", soleOwnerCount };
  }

  // Delete via admin client (service role key — never leaves server)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) return { error: "Account konnte nicht gelöscht werden. Bitte wende dich an den Support." };

  redirect("/anmelden");
}
