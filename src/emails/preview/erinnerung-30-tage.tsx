import { ReminderEmail } from "../ReminderEmail";

const siteUrl = "https://app.narravit.de";

export default function Preview() {
  return (
    <ReminderEmail
      fullName="Maria Muster"
      projectName="Omas Lebensbuch"
      expiresAtFormatted="13. November 2026"
      daysLeft={30}
      variant="30"
      renewUrl={`${siteUrl}/projektuebersicht/beispiel`}
      siteUrl={siteUrl}
    />
  );
}
