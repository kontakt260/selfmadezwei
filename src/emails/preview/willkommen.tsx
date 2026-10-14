import { WelcomeEmail } from "../WelcomeEmail";

const siteUrl = "https://stage-app.narravit.de";

export default function Preview() {
  return <WelcomeEmail fullName="Maria Muster" siteUrl={siteUrl} />;
}
