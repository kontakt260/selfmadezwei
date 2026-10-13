import {
  Layout,
  MailCtaButton,
  MailHeading,
  MailInlineFallbackLink,
  MailParagraph,
} from "../Layout";
import { LEGAL_PLACEHOLDER, authLink } from "./shared";

// Supabase-Vorlage „Reset password" — wird nach „Passwort vergessen"
// verschickt.
export function ResetPasswordTemplate() {
  const link = authLink("recovery");

  return (
    <Layout
      preview="Über den Link in dieser E-Mail legen Sie ein neues Passwort fest."
      headerEyebrow="Ihr Konto"
      footerLegal={LEGAL_PLACEHOLDER}
    >
      <MailHeading>Neues Passwort festlegen</MailHeading>
      <MailParagraph>Guten Tag,</MailParagraph>
      <MailParagraph>
        Sie haben angefordert, das Passwort für Ihr NARRAVIT-Konto
        zurückzusetzen. Über den folgenden Button legen Sie ein neues
        Passwort fest.
      </MailParagraph>

      <MailCtaButton href={link}>Neues Passwort festlegen</MailCtaButton>
      <MailInlineFallbackLink href={link} />

      <MailParagraph>
        <br />
        Der Link ist aus Sicherheitsgründen nur begrenzt gültig und kann nur
        einmal verwendet werden. Sollte er abgelaufen sein, fordern Sie über
        „Passwort vergessen?" einfach einen neuen an.
      </MailParagraph>
      <MailParagraph>
        Melden Sie sich sonst mit Google oder Facebook an? Das funktioniert
        weiterhin wie gewohnt — ein Passwort brauchen Sie dafür nicht.
      </MailParagraph>
      <MailParagraph>
        Sie haben das nicht angefordert? Dann müssen Sie nichts tun: Ihr
        bisheriges Passwort bleibt gültig.
      </MailParagraph>
    </Layout>
  );
}
