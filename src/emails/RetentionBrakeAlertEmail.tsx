// PROJ-28 — interner Hinweis an den Support.
//
// Geht raus, wenn der tägliche Löschlauf wegen zu vieler fälliger Projekte
// nichts verschoben hat. Enthält bewusst nur Zahlen, keine personenbezogenen
// Daten.

import {
  Layout,
  MailDetailsList,
  MailHeading,
  MailParagraph,
} from "./Layout";

export type RetentionBrakeAlertEmailProps = {
  due: number;
  limit: number;
};

export function RetentionBrakeAlertEmail({ due, limit }: RetentionBrakeAlertEmailProps) {
  return (
    <Layout
      preview="Der automatische Löschlauf wurde angehalten."
      headerEyebrow="Interner Hinweis"
    >
      <MailHeading>Löschlauf angehalten</MailHeading>
      <MailParagraph>
        Heute wären mehr Projekte automatisch in den Papierkorb gekommen, als ein
        Lauf verschieben darf. Deshalb wurde kein einziges Projekt verschoben.
      </MailParagraph>

      <MailDetailsList
        items={[
          { label: "Fällige Projekte", value: String(due) },
          { label: "Grenze pro Lauf", value: String(limit) },
        ]}
      />

      <MailParagraph>
        Bitte prüfen Sie die Ablaufdaten nach der Anleitung in{" "}
        <strong>docs/production/support-papierkorb.md</strong>, Abschnitt 7. Bis
        dahin kommt dieser Hinweis bei jedem täglichen Lauf.
      </MailParagraph>
    </Layout>
  );
}
