import { redirect } from "next/navigation";
import { assertLoaded } from "@/lib/supabase/page-data";
import { createClient } from "@/lib/supabase/server";
import { hasPasswordLogin } from "@/lib/auth/has-password";
import { PersonalAreaClient } from "./PersonalAreaClient";

export default async function PersoenlicherBereichPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Profile data
  const profileResult = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  // PROJ-30: Sonst stünde bei einem Aussetzer ein leerer Name im Formular.
  assertLoaded(profileResult);
  const profile = profileResult.data;

  const authProvider = (user.app_metadata?.provider as string | undefined) ?? "email";

  return (
    <PersonalAreaClient
      fullName={profile?.full_name ?? ""}
      email={user.email ?? ""}
      authProvider={authProvider}
      hasPassword={hasPasswordLogin(user)}
    />
  );
}
