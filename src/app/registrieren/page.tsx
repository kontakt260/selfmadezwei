import { RegistrierenClient } from "./RegistrierenClient";

// PROJ-9 Hotfix B-3: Server-Component liest searchParams server-seitig
// und reicht initiale Werte (email/next/onboardingIntent) an die
// Client-Komponente. Vorher war die ganze Seite Client mit useSearchParams
// in einer Suspense-Boundary — auf Vercel-Edge-Cache lieferte das SSR-HTML
// ohne die Hidden-Inputs aus → User submittete vor JS-Hydration → next-Param
// verloren → Accept-Flow brach.
//
// force-dynamic verhindert zusätzlich, dass Next.js die Seite statisch
// pre-rendert (was bei Auth-Pages mit Session-/URL-Param-Logik sowieso
// die richtige Semantik ist).

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstString(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default async function RegistrierenPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const initialEmail = firstString(params.email);
  const initialNext = firstString(params.next);
  const initialOnboardingIntent =
    firstString(params.for) || firstString(params.forWhom);

  return (
    <RegistrierenClient
      initialEmail={initialEmail}
      initialNext={initialNext}
      initialOnboardingIntent={initialOnboardingIntent}
    />
  );
}
