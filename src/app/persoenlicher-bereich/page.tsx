import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonalAreaClient } from "./PersonalAreaClient";

export default async function PersoenlicherBereichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Profile data
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const authProvider = (user.app_metadata?.provider as string | undefined) ?? "email";

  return (
    <PersonalAreaClient
      fullName={profile?.full_name ?? ""}
      email={user.email ?? ""}
      authProvider={authProvider}
    />
  );
}
