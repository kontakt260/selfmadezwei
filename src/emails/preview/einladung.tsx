import { InvitationEmail } from "../InvitationEmail";

const siteUrl = "https://app.narravit.de";

export default function Preview() {
  return (
    <InvitationEmail
      inviterName="Maria Muster"
      inviterEmail="maria@example.de"
      projectName="Omas Lebensbuch"
      role="co_author"
      token="beispiel-token"
      siteUrl={siteUrl}
    />
  );
}
