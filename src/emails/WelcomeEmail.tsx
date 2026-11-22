// PROJ-11 — Welcome-Mail nach Account-Verifikation.
//
// Trigger: /auth/callback nach Bestätigung der E-Mail bzw. erstem
// Google-/Facebook-Login, für Konten jünger als 14 Tage, sofern kein
// mail_log-Eintrag „welcome" für die user_id existiert.
//
// Abgrenzung: Diese Mail kommt NICHT direkt nach Sign-up — die
// Verifikations-Mail von Supabase Auth ist eine separate Mail.
//
// Texte und Bild: Figma „05 Willkommen" (Jakob, 2026-11-19).

import {
  Layout,
  MAIL_ASSETS_URL,
  MailCodeBox,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  mailLinkStyle,
} from "./Layout";

export type WelcomeEmailProps = {
  fullName?: string;
  siteUrl: string;
  /** Nur für selbst registrierte Konten ohne Kauf und ohne Einladung. */
  discount?: { code: string; amountLabel: string };
};

export function WelcomeEmail({ fullName, siteUrl, discount }: WelcomeEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const startUrl = `${siteUrl}/`;

  return (
    <Layout
      preview="Willkommen bei NARRAVIT — schön, dass Sie da sind."
      headerEyebrow="Willkommen"
      cardImage={{
        src: `${MAIL_ASSETS_URL}/willkommen-strand.jpg`,
        alt: "Zwei Menschen gehen auf einem Holzsteg durch die Dünen zum Meer",
        height: 300,
      }}
    >
      <MailHeading>Schön, dass Sie da sind</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        Ihr NARRAVIT-Konto ist bestätigt. Sie können jetzt loslegen — egal,
        ob Sie selbst schreiben oder per Sprachnachricht erzählen möchten:
      </MailParagraph>
      <MailParagraph>
        — Beginnen Sie Ihr <strong>Buch-Projekt</strong> und gestalten Sie das
        Cover.
        <br />— Laden Sie <strong>Familienmitglieder</strong> als
        Co-Autorinnen oder Projektleiter:innen ein.
        <br />— Erzählen Sie Ihre Geschichten per{" "}
        <strong>Sprachnachricht</strong> oder schreiben Sie sie im{" "}
        <strong>A5-Editor</strong>, unsere selektierten{" "}
        <strong>Leitfragen</strong> helfen dabei.
        <br />— Lassen Sie sich von regelmäßigen{" "}
        <strong>Erzähl-Impulsen</strong> und{" "}
        <strong>tiefgehenden Leitfragen</strong> inspirieren.
      </MailParagraph>

      {discount ? (
        <>
          <MailParagraph>
            Als Willkommensgeschenk erhalten Sie{" "}
            <strong>{discount.amountLabel} Rabatt</strong> auf Ihr Lebensbuch.
            Geben Sie dafür beim Bezahlen diesen Code ein:
          </MailParagraph>
          <MailCodeBox code={discount.code} />
        </>
      ) : null}

      <MailCtaButton href={startUrl}>Jetzt eigenes Buch beginnen</MailCtaButton>

      <MailParagraph>
        Wenn Sie Fragen haben oder etwas hakt, schreiben Sie uns einfach an{" "}
        <a href="mailto:kontakt@narravit.de" style={mailLinkStyle}>
          kontakt@narravit.de
        </a>{" "}
        — wir helfen gern weiter.
      </MailParagraph>
    </Layout>
  );
}
