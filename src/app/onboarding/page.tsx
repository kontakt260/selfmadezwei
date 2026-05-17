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

  const defaultFullName =
    (user?.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <OnboardingWizard
      defaultFullName={defaultFullName}
      buyerEmail={user?.email ?? ""}
      initialForWhom={initialForWhom}
      backUrl={user ? "/" : "https://www.narravit.de"}
    />
  );
}
