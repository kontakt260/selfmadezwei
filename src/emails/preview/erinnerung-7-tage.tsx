import { ReminderEmail } from "../ReminderEmail";

const siteUrl = "https://stage-app.narravit.de";

export default function Preview() {
  return (
    <ReminderEmail
      fullName="Maria Muster"
      projectName="Omas Lebensbuch"
      expiresAtFormatted="21. Oktober 2026"
      daysLeft={7}
      variant="7"
      renewUrl={`${siteUrl}/projektuebersicht/beispiel`}
      siteUrl={siteUrl}
    />
  );
}
