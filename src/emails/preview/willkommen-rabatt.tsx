import { WelcomeEmail } from "../WelcomeEmail";

const siteUrl = "https://app.narravit.de";

export default function Preview() {
  return (
    <WelcomeEmail
      fullName="Maria Muster"
      siteUrl={siteUrl}
      discount={{ code: "BUCH50", amountLabel: "50 €" }}
    />
  );
}
