import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: projects } = await supabase
      .from("projects")
      .select("portal_access_expires_at")
      .limit(50);

    const now = Date.now();
    const hasActiveAccess =
      projects?.some(
        (p) =>
          p.portal_access_expires_at && new Date(p.portal_access_expires_at).getTime() > now,
      ) ?? false;

    if (hasActiveAccess) {
      redirect("/");
    }
  }

  const defaultFullName =
    (user?.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <OnboardingWizard defaultFullName={defaultFullName} buyerEmail={user?.email ?? ""} />
  );
}
