import { AnmeldenClient } from "./AnmeldenClient";

// PROJ-9 Hotfix B-3: Server-Component reicht searchParams an Client.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstString(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <AnmeldenClient
      initialEmail={firstString(params.email)}
      initialNext={firstString(params.next)}
      showExpiredLink={firstString(params.error) === "expired_link"}
    />
  );
}
