import { RenewalEmail } from "../RenewalEmail";

const siteUrl = "https://app.narravit.de";

// Info an die anderen Projektmitglieder, wenn jemand den Zugang verlängert
// hat — ohne Betrag und Rechnung.
export default function Preview() {
  return (
    <RenewalEmail
      fullName="Lena Muster"
      renewedBy="Maria Muster"
      projectName="Omas Lebensbuch"
      newExpiresAtFormatted="14. Oktober 2028"
      siteUrl={siteUrl}
      projectId="beispiel"
    />
  );
}
