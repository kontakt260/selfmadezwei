import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

type SearchParams = Record<string, string | string[] | undefined>;
type InitialForWhom = "self" | "gift" | null;

function parseInitialForWhom(searchParams: SearchParams): InitialForWhom {
  const rawValue = searchParams.forWhom ?? searchParams.for ?? searchParams.intent;
  const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.toLowerCase();

  switch (value) {
    case "self":
    case "me":
    case "ich":
    case "fuer-mich":
    case "für-mich":
      return "self";
    case "gift":
    case "geschenk":
      return "gift";
    default:
      return null;
  }
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialForWhom = parseInitialForWhom(resolvedSearchParams);

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
    <OnboardingWizard
      defaultFullName={defaultFullName}
      buyerEmail={user?.email ?? ""}
      initialForWhom={initialForWhom}
    />
  );
}
