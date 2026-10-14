import { InvitationEmail } from "../InvitationEmail";

const siteUrl = "https://stage-app.narravit.de";

export default function Preview() {
  return (
    <InvitationEmail
      inviterName="Lena Muster"
      inviterEmail="lena@example.de"
      projectName="Lebensgeschichten"
      role="projektleiter"
      token="beispiel-token"
      siteUrl={siteUrl}
      isGift
    />
  );
}
