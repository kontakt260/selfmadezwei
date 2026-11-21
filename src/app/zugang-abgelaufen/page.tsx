import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { CheckoutCancelToast } from "@/components/CheckoutCancelToast";
import { CheckoutButton } from "@/components/projektuebersicht/CheckoutButton";
import { formatGermanDate } from "@/lib/email/format";
import { CONTENT_RETENTION_DAYS, isAccessExpired } from "@/lib/projects/project-access";
import { createClient } from "@/lib/supabase/server";

// Hierher leitet die Middleware, wenn der Zugang eines Projekts abgelaufen
// ist (`?project=<id>`) oder alle Projekte des Kontos abgelaufen sind. Die
// Seite ist der Weg zurück: Jedes Projektmitglied kann hier verlängern
// (PROJ-6, BUG-G1). Die Berechtigung prüft `startCheckoutAction` serverseitig.

const primaryButton = "bg-[#D0BCA6] text-[#0a0909] hover:bg-[#c0ad98] sm:w-full";

export default async function ZugangAbgelaufenPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  const requestedId = typeof project === "string" ? project : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthLayout>
        <div className="text-center">
          <h1 className="heading-style-h2 mb-4">Ihr Zugang ist abgelaufen</h1>
          <p className="mb-8 text-[#535252]">
            Bitte melden Sie sich an, um Ihren NARRAVIT-Projektzugang zu verlängern.
          </p>
          <Link
            href="/anmelden?next=%2Fzugang-abgelaufen"
            className="inline-flex h-12 w-full items-center justify-center bg-[#D0BCA6] px-4 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
          >
            Anmelden
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // RLS liefert nur die Projekte, in denen die Person Mitglied ist.
  const { data: accessRows } = await supabase
    .from("project_access")
    .select("project_id, expires_at")
    .limit(50);

  const expiredRows = (accessRows ?? []).filter((row) => isAccessExpired(row.expires_at));
  // Nichts abgelaufen (z. B. gerade verlängert): zurück in die App.
  if (expiredRows.length === 0) redirect("/");

  const requestedRow = expiredRows.find((row) => row.project_id === requestedId);
  const shownRows = requestedRow ? [requestedRow] : expiredRows;
  const hasActiveProject = (accessRows ?? []).some(
    (row) => row.expires_at !== null && !isAccessExpired(row.expires_at),
  );

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title")
    .in(
      "id",
      shownRows.map((row) => row.project_id),
    )
    .limit(50);
  const titleById = new Map((projects ?? []).map((p) => [p.id, p.title]));

  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <CheckoutCancelToast />
      </Suspense>
      <div className="text-center">
        <h1 className="heading-style-h2 mb-4">Ihr Zugang ist abgelaufen</h1>
        <p className="mb-8 text-[#535252]">
          Ihr NARRAVIT-Projektzugang ist nicht mehr aktiv. Verlängern Sie ihn, um weiter
          in Ihrem Projekt schreiben zu können. Ihre Inhalte bleiben nach Ablauf des
          Projekts noch {CONTENT_RETENTION_DAYS} Tage bei uns gespeichert, bevor wir sie
          endgültig löschen.
        </p>

        <ul className="mb-6 flex flex-col gap-4 text-left">
          {shownRows.map((row) => (
            <li key={row.project_id} className="border border-[#e0dcd5] bg-white p-4">
              <p className="break-words font-bold text-[#3E3831]">
                {titleById.get(row.project_id) ?? "Ihr Projekt"}
              </p>
              <p className="mb-3 text-sm text-[#848484]">
                Abgelaufen am {formatGermanDate(row.expires_at as string)}
              </p>
              <CheckoutButton
                label="Um 12 Monate verlängern — 99 €"
                loadingLabel="Wird vorbereitet …"
                input={{ productType: "renewal", projectId: row.project_id }}
                className={primaryButton}
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-center gap-3">
          {hasActiveProject ? (
            <Link
              href="/"
              className="text-sm font-bold text-[#534B42] underline underline-offset-4 transition-colors hover:text-[#96B897]"
            >
              Zu meinen anderen Projekten
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </div>
    </AuthLayout>
  );
}
