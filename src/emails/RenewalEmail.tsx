// PROJ-11 — Verlängerungs-Bestätigung (12-Monate-Renewal).
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = renewal_portal_access (PROJ-6).

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type RenewalEmailProps = {
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  /** Neues Ablauf-Datum, z. B. „22. Mai 2027" */
  newExpiresAtFormatted: string;
  invoiceUrl?: string;
  siteUrl: string;
};

export function RenewalEmail({
  fullName,
  amountFormatted,
  paymentDateFormatted,
  newExpiresAtFormatted,
  invoiceUrl,
  siteUrl,
}: RenewalEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const personalAreaUrl = `${siteUrl}/`;

  const details: Array<{ label: string; value: string }> = [
    { label: "Betrag", value: amountFormatted },
    { label: "Zahlungs-Datum", value: paymentDateFormatted },
    { label: "Neuer Zugang gültig bis", value: newExpiresAtFormatted },
  ];

  return (
    <Layout
      preview={`Ihr narravit-Portal-Zugang wurde um 12 Monate verlängert. Neu gültig bis ${newExpiresAtFormatted}.`}
      headerEyebrow="Verlängerung"
      siteUrl={siteUrl}
    >
      <MailHeading>Ihr Portal-Zugang wurde verlängert</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        vielen Dank — Ihr narravit-Portal-Zugang ist um weitere{" "}
        <strong>12 Monate</strong> verlängert. Sie können wie gewohnt
        weiter schreiben, einladen und erzählen.
      </MailParagraph>

      <MailDetailsList items={details} />

      <MailCtaButton href={personalAreaUrl}>
        Zum persönlichen Bereich
      </MailCtaButton>

      {invoiceUrl ? (
        <MailParagraph>
          Ihre Rechnung finden Sie{" "}
          <a
            href={invoiceUrl}
            style={{ color: "#3E3831", textDecoration: "underline" }}
          >
            hier
          </a>
          .
        </MailParagraph>
      ) : null}
    </Layout>
  );
}
