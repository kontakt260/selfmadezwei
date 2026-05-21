import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AcceptInvitationButton } from "./AcceptInvitationButton";

// PROJ-9 — Einladungs-Annahme-Seite.
//
// Token ist die Authentifizierung. Der Lookup läuft über die
// SECURITY-DEFINER-Postgres-Funktion `lookup_invitation_by_token` —
// nicht-Mitglieder haben per RLS keinen Lese-Zugriff auf invitations.
//
// 4 Varianten je nach Lookup + Auth-Status:
//   1. Token ungültig / abgelaufen / bereits angenommen / Projekt gelöscht
//      → Hinweis + Link zur Startseite.
//   2. Token OK + User NICHT eingeloggt
//      → Vorschau + „Anmelden"/„Konto erstellen"-Buttons mit
//        ?email=<invited>&next=/einladung/<token>.
//   3. Token OK + User eingeloggt, Email != Einladung
//      → Hinweis „bitte mit der korrekten Adresse anmelden" + Abmelden-Link.
//   4. Token OK + User eingeloggt, Email == Einladung
//      → Vorschau + „Annehmen"-Button (Client-Komponente mit Server-Action).

const ROLE_LABEL: Record<string, string> = {
  projektleiter: "Projektleiter:in",
  co_author: "Co-Autor:in",
};

type LookupRow = {
  invitation_id: string;
  project_id: string;
  project_title: string | null;
  email: string;
  role: "projektleiter" | "co_author";
  expires_at: string;
  accepted_at: string | null;
  inviter_full_name: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function EinladungAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: lookup } = await supabase
    .rpc("lookup_invitation_by_token", { p_token: token })
    .maybeSingle<LookupRow>();

  // Variante 1a: Token nicht gefunden.
  if (!lookup) {
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Einladung nicht gefunden
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Dieser Einladungs-Link ist ungültig oder wurde widerrufen.
          Bitte erfrage einen neuen Link bei deinem Projektleiter.
        </p>
        <HomeLink />
      </CenteredCard>
    );
  }

  // Variante 1b: Projekt existiert nicht mehr.
  if (!lookup.project_title || !lookup.project_id) {
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Projekt nicht mehr verfügbar
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Dieses Projekt existiert nicht mehr und kann nicht mehr beigetreten werden.
        </p>
        <HomeLink />
      </CenteredCard>
    );
  }

  // Variante 1c: bereits angenommen.
  if (lookup.accepted_at !== null) {
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Diese Einladung wurde bereits angenommen
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Wenn du Mitglied dieses Projekts bist, findest du es in deiner
          Projektliste auf der Startseite.
        </p>
        <HomeLink />
      </CenteredCard>
    );
  }

  // Variante 1d: abgelaufen.
  if (new Date(lookup.expires_at).getTime() < Date.now()) {
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Diese Einladung ist abgelaufen
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte erfrage einen neuen Link bei deinem Projektleiter.
        </p>
        <HomeLink />
      </CenteredCard>
    );
  }

  // Auth-Status ermitteln.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inviteEmail = lookup.email.trim().toLowerCase();
  const sessionEmail = (user?.email ?? "").trim().toLowerCase();

  const preview = (
    <div className="flex flex-col gap-2">
      <p className="[font-family:var(--font-pt-serif)] text-xl text-[#3E3831] sm:text-2xl">
        {lookup.project_title}
      </p>
      <dl className="grid grid-cols-1 gap-2 text-base leading-7 text-[#535252] sm:text-lg">
        <div className="flex flex-row gap-3">
          <dt className="w-28 shrink-0 font-semibold text-[#3E3831]">Rolle</dt>
          <dd>{ROLE_LABEL[lookup.role] ?? lookup.role}</dd>
        </div>
        {lookup.inviter_full_name && (
          <div className="flex flex-row gap-3">
            <dt className="w-28 shrink-0 font-semibold text-[#3E3831]">Eingeladen von</dt>
            <dd>{lookup.inviter_full_name}</dd>
          </div>
        )}
        <div className="flex flex-row gap-3">
          <dt className="w-28 shrink-0 font-semibold text-[#3E3831]">Für</dt>
          <dd>{lookup.email}</dd>
        </div>
        <div className="flex flex-row gap-3">
          <dt className="w-28 shrink-0 font-semibold text-[#3E3831]">Gültig bis</dt>
          <dd>{formatDate(lookup.expires_at)}</dd>
        </div>
      </dl>
    </div>
  );

  // Variante 2: nicht eingeloggt.
  if (!user) {
    const returnPath = `/einladung/${encodeURIComponent(token)}`;
    const emailParam = encodeURIComponent(lookup.email);
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Du wurdest zu einem Projekt eingeladen
        </h1>
        {preview}
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte melde dich mit deiner E-Mail-Adresse an oder erstelle ein
          neues Konto. Achte darauf, exakt die eingeladene Adresse zu
          verwenden — sonst kannst du die Einladung nicht annehmen.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href={`/anmelden?email=${emailParam}&next=${encodeURIComponent(returnPath)}`}
            className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
          >
            Anmelden
          </Link>
          <Link
            href={`/registrieren?email=${emailParam}&next=${encodeURIComponent(returnPath)}`}
            className="inline-flex h-12 items-center justify-center border border-[#e0dcd5] bg-white px-6 text-lg font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0]"
          >
            Konto erstellen
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // Variante 3: eingeloggt, Email-Mismatch.
  if (sessionEmail !== inviteEmail) {
    return (
      <CenteredCard>
        <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
          Falsche E-Mail-Adresse
        </h1>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Diese Einladung gilt für{" "}
          <span className="font-semibold">{lookup.email}</span>, du bist aber als{" "}
          <span className="font-semibold">{user.email}</span> eingeloggt.
        </p>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte melde dich mit der korrekten E-Mail-Adresse an, um die
          Einladung anzunehmen.
        </p>
        <div className="self-start">
          <SignOutButton />
        </div>
      </CenteredCard>
    );
  }

  // Variante 4: eingeloggt, Email-Match. „Annehmen"-Pfad.
  return (
    <CenteredCard>
      <h1 className="[font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
        Einladung annehmen
      </h1>
      {preview}
      <p className="text-base leading-7 text-[#535252] sm:text-lg">
        Wenn du auf „Annehmen" klickst, wirst du als Mitglied hinzugefügt
        und landest direkt in der Projektübersicht.
      </p>
      <AcceptInvitationButton token={token} projectId={lookup.project_id} />
    </CenteredCard>
  );
}

// ─── Layout-Helper ─────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex w-full max-w-xl flex-col gap-6 border border-[#e0dcd5] bg-white p-6 sm:gap-8 sm:p-10">
        {children}
      </div>
    </main>
  );
}

function HomeLink() {
  return (
    <Link
      href="/"
      className="self-start text-base text-[#3E3831] underline decoration-[#3E3831]/30 hover:decoration-[#3E3831]"
    >
      Zur Startseite
    </Link>
  );
}
