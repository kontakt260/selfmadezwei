// PROJ-11 — Einladungs-Mail.
//
// Trigger:
//   - createInvitationAction in PROJ-9 — nach erfolgreicher Anlage der
//     invitations-Row, vor Rückgabe an den UI-Step-2-Modal.
//   - Stripe-Webhook beim Geschenk-Kauf „Auch am Computer schreiben"
//     (`isGift`): Die beschenkte Person bekommt ihre Einladung ins Portal.

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailInlineFallbackLink,
} from "./Layout";

type Role = "projektleiter" | "co_author";

export type InvitationEmailProps = {
  inviterName: string;
  inviterEmail: string;
  projectName: string;
  role: Role;
  token: string;
  /** Base-URL für den Einladungs-Link, z. B. https://stage-app.narravit.de */
  siteUrl: string;
  /** Einladung aus einem Geschenk-Kauf — eigener Einstieg statt „Sie wurden eingeladen". */
  isGift?: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  projektleiter: "Projektleiterin / Projektleiter",
  co_author: "Co-Autorin / Co-Autor",
};

export function InvitationEmail({
  inviterName,
  inviterEmail,
  projectName,
  role,
  token,
  siteUrl,
  isGift = false,
}: InvitationEmailProps) {
  const acceptUrl = `${siteUrl}/einladung/${token}`;
  const inviterDisplay = inviterName.trim() || inviterEmail;

  if (isGift) {
    return (
      <Layout
        preview={`${inviterDisplay} schenkt Ihnen ein Lebensbuch bei narravit.`}
        headerEyebrow="Ein Geschenk für Sie"
        siteUrl={siteUrl}
      >
        <MailHeading>Ihr Lebensbuch wartet auf Sie</MailHeading>
        <MailParagraph>
          <strong>{inviterDisplay}</strong> schenkt Ihnen ein Lebensbuch bei
          narravit. Darin halten Sie Ihre Lebensgeschichte fest — Kapitel für
          Kapitel, in Ruhe und in Ihrem eigenen Tempo. Am Ende entsteht daraus
          ein gedrucktes Buch.
        </MailParagraph>
        <MailParagraph>
          Mit einem Klick auf den Button nehmen Sie das Geschenk an. Falls
          Sie noch kein narravit-Konto haben, legen Sie dabei eines an.
          Danach können Sie Ihre Geschichten direkt am Computer oder Tablet
          aufschreiben.
        </MailParagraph>

        <MailCtaButton href={acceptUrl}>Geschenk annehmen</MailCtaButton>

        <MailInlineFallbackLink href={acceptUrl} />

        <MailParagraph>Der Link ist 14 Tage gültig.</MailParagraph>
      </Layout>
    );
  }

  return (
    <Layout
      preview={`${inviterDisplay} hat Sie zum Projekt „${projectName}" eingeladen.`}
      headerEyebrow="Einladung"
      siteUrl={siteUrl}
    >
      <MailHeading>Sie wurden eingeladen</MailHeading>
      <MailParagraph>
        <strong>{inviterDisplay}</strong> hat Sie zum Projekt{" "}
        <strong>„{projectName}"</strong> eingeladen — als{" "}
        <strong>{ROLE_LABEL[role]}</strong>.
      </MailParagraph>
      <MailParagraph>
        Mit einem Klick auf den Button öffnen Sie die Einladungs-Vorschau
        und können sie anschließend mit Ihrem narravit-Konto annehmen.
      </MailParagraph>

      <MailCtaButton href={acceptUrl}>Einladung öffnen</MailCtaButton>

      <MailInlineFallbackLink href={acceptUrl} />

      <MailParagraph>
        Der Einladungs-Link ist 14 Tage gültig. Sollte Ihre Einladung
        abgelaufen sein, bitten Sie {inviterDisplay}, Ihnen eine neue
        Einladung zu schicken.
      </MailParagraph>
    </Layout>
  );
}
