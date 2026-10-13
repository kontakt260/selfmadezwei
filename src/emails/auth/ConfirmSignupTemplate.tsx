import {
  Layout,
  MailCtaButton,
  MailHeading,
  MailInlineFallbackLink,
  MailParagraph,
} from "../Layout";
import { LEGAL_PLACEHOLDER, authLink } from "./shared";

// Supabase-Vorlage „Confirm signup" — wird nach der Registrierung verschickt.
export function ConfirmSignupTemplate() {
  const link = authLink("email");

  return (
    <Layout
      preview="Nur noch ein Klick, dann können Sie mit Ihrem Lebensbuch beginnen."
      headerEyebrow="Willkommen"
      footerLegal={LEGAL_PLACEHOLDER}
    >
      <MailHeading>Schön, dass Sie da sind</MailHeading>
      <MailParagraph>Guten Tag,</MailParagraph>
      <MailParagraph>
        vielen Dank für Ihre Registrierung bei NARRAVIT. Bitte bestätigen Sie
        kurz Ihre E-Mail-Adresse — danach können Sie direkt beginnen, Ihre
        Erinnerungen festzuhalten.
      </MailParagraph>

      <MailCtaButton href={link}>E-Mail-Adresse bestätigen</MailCtaButton>
      <MailInlineFallbackLink href={link} />

      <MailParagraph>
        <br />
        Der Link ist aus Sicherheitsgründen nur begrenzt gültig und kann nur
        einmal verwendet werden. Sollte er abgelaufen sein, fordern Sie auf
        der Anmeldeseite einfach eine neue Bestätigungs-E-Mail an.
      </MailParagraph>
      <MailParagraph>
        Sie haben sich nicht bei NARRAVIT registriert? Dann können Sie diese
        E-Mail ignorieren — ohne Bestätigung wird kein Konto aktiviert.
      </MailParagraph>
    </Layout>
  );
}
