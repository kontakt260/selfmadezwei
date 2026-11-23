import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";
import { CheckoutCancelToast } from "@/components/CheckoutCancelToast";

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

  // PROJ-28: Wer kein Projekt (mehr) hat, muss sein Konto trotzdem finden und
  // löschen können, auch wenn das letzte Projekt automatisch entfernt wurde.
  let showPersonalAreaLink = false;
  if (user) {
    const { count, error } = await supabase
      .from("project_members")
      .select("project_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    showPersonalAreaLink = !error && (count ?? 0) === 0;
  }

  return (
    <>
      <Suspense fallback={null}>
        <CheckoutCancelToast />
      </Suspense>
      <OnboardingWizard
        defaultFullName={defaultFullName}
        buyerEmail={user?.email ?? ""}
        userId={user?.id ?? null}
        isGuest={!user}
        initialForWhom={initialForWhom}
        backUrl={user ? "/" : "https://www.narravit.de"}
        showPersonalAreaLink={showPersonalAreaLink}
      />
    </>
  );
}
