import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AcceptInvitationButton } from "./AcceptInvitationButton";
import { InvitationCard, InvitationHeading, InvitationPreview } from "./InvitationCard";
import { isPast } from "@/lib/dates";

// PROJ-9 — Einladungs-Annahme-Seite.
//
// Token ist die Authentifizierung. Der Lookup läuft über die
// SECURITY-DEFINER-Postgres-Funktion `lookup_invitation_by_token` —
// nicht-Mitglieder haben per RLS keinen Lese-Zugriff auf invitations.
// Aufruf über den Service-Role-Client: die Funktion ist seit Migration
// 20261119210000_lookup_invitation_service_role_only nicht mehr für
// anon/authenticated freigegeben (kein öffentlicher RPC).
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
//
// Geschenk-Einladungen (`invitations.is_gift`) bekommen eigene Texte und
// zeigen weder Projekttitel noch Rolle (Jakob, 2026-11-21).

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

export default async function EinladungAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const serviceRole = createServiceRoleClient();
  const { data: lookup } = await serviceRole
    .rpc("lookup_invitation_by_token", { p_token: token })
    .maybeSingle<LookupRow>();

  // Variante 1a: Token nicht gefunden.
  if (!lookup) {
    return (
      <InvitationCard>
        <InvitationHeading>Einladung nicht gefunden</InvitationHeading>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Dieser Einladungs-Link ist ungültig oder wurde widerrufen.
          Bitte erfragen Sie einen neuen Link bei Ihrem Projektleiter.
        </p>
        <HomeLink />
      </InvitationCard>
    );
  }

  // Variante 1b: Projekt existiert nicht mehr.
  if (!lookup.project_title || !lookup.project_id) {
    return (
      <InvitationCard>
        <InvitationHeading>Projekt nicht mehr verfügbar</InvitationHeading>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Dieses Projekt existiert nicht mehr und kann nicht mehr beigetreten werden.
        </p>
        <HomeLink />
      </InvitationCard>
    );
  }

  // Variante 1c: bereits angenommen.
  if (lookup.accepted_at !== null) {
    return (
      <InvitationCard>
        <InvitationHeading>Diese Einladung wurde bereits angenommen</InvitationHeading>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Wenn Sie Mitglied dieses Projekts sind, finden Sie es in Ihrer
          Projektliste auf der Startseite.
        </p>
        <HomeLink />
      </InvitationCard>
    );
  }

  // Variante 1d: abgelaufen.
  if (isPast(lookup.expires_at)) {
    return (
      <InvitationCard>
        <InvitationHeading>Diese Einladung ist abgelaufen</InvitationHeading>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte erfragen Sie einen neuen Link bei Ihrem Projektleiter.
        </p>
        <HomeLink />
      </InvitationCard>
    );
  }

  // Auth-Status ermitteln.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inviteEmail = lookup.email.trim().toLowerCase();
  const sessionEmail = (user?.email ?? "").trim().toLowerCase();

  const { data: giftRow } = await serviceRole
    .from("invitations")
    .select("is_gift")
    .eq("id", lookup.invitation_id)
    .maybeSingle();
  const isGift = giftRow?.is_gift === true;

  const previewFor = (giftTitle: string) => (
    <InvitationPreview
      title={isGift ? giftTitle : lookup.project_title!}
      role={isGift ? undefined : (ROLE_LABEL[lookup.role] ?? lookup.role)}
      inviter={lookup.inviter_full_name || undefined}
      email={lookup.email}
    />
  );

  // Variante 2: nicht eingeloggt.
  if (!user) {
    const returnPath = `/einladung/${encodeURIComponent(token)}`;
    const emailParam = encodeURIComponent(lookup.email);
    return (
      <InvitationCard>
        <InvitationHeading>
          {isGift ? "Ihr Lebensbuch wartet auf Sie" : "Sie wurden zu einem Projekt eingeladen"}
        </InvitationHeading>
        {previewFor("Ihr Geschenk: Ein hochwertiges Buch")}
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte melden Sie sich mit Ihrer E-Mail-Adresse an oder erstellen Sie ein
          neues Konto. Achten Sie darauf, exakt die hier zu sehende E-Mail-Adresse
          zu verwenden.
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
      </InvitationCard>
    );
  }

  // Variante 3: eingeloggt, Email-Mismatch.
  if (sessionEmail !== inviteEmail) {
    return (
      <InvitationCard>
        <InvitationHeading>Falsche E-Mail-Adresse</InvitationHeading>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Diese Einladung gilt für{" "}
          <span className="font-semibold">{lookup.email}</span>, Sie sind aber als{" "}
          <span className="font-semibold">{user.email}</span> eingeloggt.
        </p>
        <p className="text-base leading-7 text-[#535252] sm:text-lg">
          Bitte melden Sie sich mit der korrekten E-Mail-Adresse an, um die
          Einladung anzunehmen.
        </p>
        <div className="self-start">
          <SignOutButton />
        </div>
      </InvitationCard>
    );
  }

  // Variante 4: eingeloggt, Email-Match. „Annehmen"-Pfad.
  return (
    <InvitationCard>
      <InvitationHeading>{isGift ? "Geschenk annehmen" : "Einladung annehmen"}</InvitationHeading>
      {previewFor("Ihre Geschichte")}
      <p className="text-base leading-7 text-[#535252] sm:text-lg">
        {isGift ? (
          <>
            Mit dem Klick auf „Annehmen“ gelangen Sie direkt zum Projekt und können mit
            dem Schreiben und Erzählen Ihrer persönlichen Erinnerungen beginnen.
          </>
        ) : (
          <>
            Wenn Sie auf „Annehmen&quot; klicken, werden Sie als Mitglied hinzugefügt
            und landen direkt in der Projektübersicht.
          </>
        )}
      </p>
      <AcceptInvitationButton token={token} projectId={lookup.project_id} />
    </InvitationCard>
  );
}

// ─── Layout-Helper ─────────────────────────────────────────────────────────

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
