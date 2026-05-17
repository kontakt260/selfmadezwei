import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonalAreaClient } from "./PersonalAreaClient";

export default async function PersoenlicherBereichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Profile data (full_name, created_at)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, created_at")
    .eq("id", user.id)
    .single();

  // Access expiry: latest portal_access_expires_at across all user projects
  const { data: projects } = await supabase
    .from("projects")
    .select("portal_access_expires_at")
    .limit(50);

  const accessExpiresAt =
    projects
      ?.map((p) => p.portal_access_expires_at)
      .filter(Boolean)
      .reduce<string | null>((max, date) => (!max || (date && date > max) ? date : max), null) ??
    null;

  const authProvider = (user.app_metadata?.provider as string | undefined) ?? "email";

  return (
    <PersonalAreaClient
      fullName={profile?.full_name ?? ""}
      email={user.email ?? ""}
      memberSince={profile?.created_at ?? user.created_at}
      accessExpiresAt={accessExpiresAt}
      authProvider={authProvider}
    />
  );
}
