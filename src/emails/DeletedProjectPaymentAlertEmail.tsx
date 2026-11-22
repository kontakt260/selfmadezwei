// PROJ-26 — interner Hinweis an den Support.
//
// Geht raus, wenn eine Verlängerung für ein Projekt bezahlt wurde, das kurz
// vorher gelöscht wurde. Enthält bewusst keine Namen oder E-Mail-Adressen.

import {
  Layout,
  MailDetailsList,
  MailHeading,
  MailParagraph,
} from "./Layout";

export type DeletedProjectPaymentAlertEmailProps = {
  projectId: string;
  stripeSessionId: string;
  /** Das Projekt liegt nicht mehr im Papierkorb, sondern ist endgültig weg. */
  finallyDeleted?: boolean;
};

export function DeletedProjectPaymentAlertEmail({
  projectId,
  stripeSessionId,
  finallyDeleted = false,
}: DeletedProjectPaymentAlertEmailProps) {
  return (
    <Layout
      preview="Verlängerung für ein gelöschtes Projekt bezahlt."
      headerEyebrow="Interner Hinweis"
    >
      <MailHeading>Zahlung für ein gelöschtes Projekt</MailHeading>
      <MailParagraph>
        {finallyDeleted
          ? "Eine Verlängerung wurde bezahlt und gebucht, das Projekt ist aber bereits endgültig gelöscht. Die Zahlung muss in Stripe erstattet werden."
          : "Eine Verlängerung wurde bezahlt und gebucht, das Projekt liegt aber im Papierkorb. Die Person kann es deshalb gerade nicht öffnen."}
      </MailParagraph>

      <MailDetailsList
        items={[
          { label: "Projekt", value: projectId },
          { label: "Stripe-Session", value: stripeSessionId },
        ]}
      />

      <MailParagraph>
        Bitte prüfen Sie den Fall nach der Anleitung in{" "}
        <strong>docs/production/support-papierkorb.md</strong>
        {finallyDeleted
          ? "."
          : " und stellen Sie das Projekt wieder her oder erstatten Sie die Zahlung."}
      </MailParagraph>
    </Layout>
  );
}
