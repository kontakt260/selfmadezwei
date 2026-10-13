// PROJ-11 — Welcome-Mail nach Account-Verifikation.
//
// Trigger: erster Server-Render einer Auth-geschützten Route NACH
// email_confirmed_at gesetzt, sofern kein mail_log-Eintrag „welcome"
// für die user_id existiert.
//
// Abgrenzung: Diese Mail kommt NICHT direkt nach Sign-up — die
// Verifikations-Mail von Supabase Auth ist eine separate Mail.

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
} from "./Layout";

export type WelcomeEmailProps = {
  fullName?: string;
  siteUrl: string;
};

export function WelcomeEmail({ fullName, siteUrl }: WelcomeEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const personalAreaUrl = `${siteUrl}/`;

  return (
    <Layout
      preview="Willkommen bei narravit — schön, dass Sie da sind."
      headerEyebrow="Willkommen"
      siteUrl={siteUrl}
    >
      <MailHeading>Schön, dass Sie da sind</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        Ihr narravit-Konto ist bestätigt. Sie können jetzt loslegen — egal,
        ob Sie selbst schreiben oder per Sprachnachricht erzählen möchten:
      </MailParagraph>
      <MailParagraph>
        — Legen Sie Ihr <strong>Lebensbuch-Projekt</strong> an und gestalten
        Sie das Cover.
        <br />— Laden Sie <strong>Familienmitglieder</strong> als
        Co-Autorinnen oder Projektleiter:innen ein.
        <br />— Erzählen Sie Ihre Geschichten per{" "}
        <strong>Sprachnachricht</strong>{" "}
        oder schreiben Sie sie selbst im <strong>A5-Editor</strong>.
        <br />— Lassen Sie sich von <strong>Erzähl-Impulsen</strong>{" "}
        inspirieren.
      </MailParagraph>

      <MailCtaButton href={personalAreaUrl}>
        Zum persönlichen Bereich
      </MailCtaButton>

      <MailParagraph>
        Wenn Sie Fragen haben oder etwas hakt, antworten Sie uns einfach an{" "}
        <a
          href="mailto:kontakt@narravit.de"
          style={{ color: "#3E3831", textDecoration: "underline" }}
        >
          kontakt@narravit.de
        </a>{" "}
        — wir helfen gern weiter.
      </MailParagraph>
    </Layout>
  );
}
