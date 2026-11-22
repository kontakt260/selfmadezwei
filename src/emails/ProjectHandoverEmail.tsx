// PROJ-3 — Mail an die neue Projektleitung.
//
// Trigger: Die bisherige einzige Projektleitung löscht ihr Konto oder verlässt
// das Projekt und bestimmt diese Person als Nachfolge. Die Mail nennt bewusst
// weder den Namen noch den Grund, das Konto kann bereits gelöscht sein.

import {
  Layout,
  MailCtaButton,
  MailHeading,
  MailInlineFallbackLink,
  MailParagraph,
} from "./Layout";

export type ProjectHandoverEmailProps = {
  fullName?: string;
  projectName: string;
  projectId: string;
  /** Base-URL der App, z. B. https://stage-app.narravit.de */
  siteUrl: string;
};

export function ProjectHandoverEmail({
  fullName,
  projectName,
  projectId,
  siteUrl,
}: ProjectHandoverEmailProps) {
  const projectUrl = `${siteUrl}/projektuebersicht/${projectId}`;
  const name = fullName?.trim();

  return (
    <Layout
      preview={`Sie leiten jetzt das Projekt „${projectName}“.`}
      headerEyebrow="Projektleitung"
    >
      <MailHeading>Sie leiten jetzt dieses Projekt</MailHeading>
      <MailParagraph>{name ? `Guten Tag ${name},` : "Guten Tag,"}</MailParagraph>
      <MailParagraph>
        die bisherige Projektleitung hat das Projekt{" "}
        <strong>„{projectName}“</strong> verlassen und Sie als Nachfolge
        bestimmt.
      </MailParagraph>
      <MailParagraph>
        Alle Kapitel bleiben erhalten. Als Projektleitung können Sie ab sofort
        weitere Personen einladen und die Mitglieder des Projekts verwalten.
      </MailParagraph>

      <MailCtaButton href={projectUrl}>Zum Projekt</MailCtaButton>

      <MailInlineFallbackLink href={projectUrl} />

      <MailParagraph>
        Möchten Sie das Projekt nicht leiten, melden Sie sich gern bei uns.
      </MailParagraph>
    </Layout>
  );
}
