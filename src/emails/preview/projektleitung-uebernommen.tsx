import { ProjectHandoverEmail } from "../ProjectHandoverEmail";

const siteUrl = "https://app.narravit.de";

// Info an die neue Projektleitung, wenn die bisherige ihr Konto löscht oder
// das Projekt verlässt.
export default function Preview() {
  return (
    <ProjectHandoverEmail
      fullName="Lena Muster"
      projectName="Omas Lebensbuch"
      projectId="beispiel"
      siteUrl={siteUrl}
    />
  );
}
