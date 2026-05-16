import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  // #region agent log
  fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5dfb08" }, body: JSON.stringify({ sessionId: "5dfb08", runId: "initial", hypothesisId: "H2-route-entry", location: "src/app/onboarding/page.tsx:6", message: "Onboarding server component entered", data: {}, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // #region agent log
  fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5dfb08" }, body: JSON.stringify({ sessionId: "5dfb08", runId: "initial", hypothesisId: "H3-supabase-user", location: "src/app/onboarding/page.tsx:13", message: "Supabase getUser returned", data: { userPresent: Boolean(user) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  if (user) {
    const { data: projects } = await supabase
      .from("projects")
      .select("portal_access_expires_at")
      .limit(50);

    // #region agent log
    fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5dfb08" }, body: JSON.stringify({ sessionId: "5dfb08", runId: "initial", hypothesisId: "H4-projects-query", location: "src/app/onboarding/page.tsx:23", message: "Projects access query returned", data: { projectCount: projects?.length ?? 0 }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion

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
