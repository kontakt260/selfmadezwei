// PROJ-11 — Portal-Kauf-Bestätigung (Erstkauf).
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = initial_portal_access (PROJ-6).

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type PortalPurchaseEmailProps = {
  /** Volle Anrede; leer = Fallback "Hallo," */
  fullName?: string;
  /** Bezahlter Betrag in formatierter Form, z. B. „199,00 €" */
  amountFormatted: string;
  /** Zahlungs-Datum, z. B. „22. Mai 2026" */
  paymentDateFormatted: string;
  /** Ablauf-Datum, z. B. „22. Mai 2027" */
  expiresAtFormatted: string;
  /** Optional: Link zur Stripe-Rechnung */
  invoiceUrl?: string;
  siteUrl: string;
};

export function PortalPurchaseEmail({
  fullName,
  amountFormatted,
  paymentDateFormatted,
  expiresAtFormatted,
  invoiceUrl,
  siteUrl,
}: PortalPurchaseEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const personalAreaUrl = `${siteUrl}/`;

  const details: Array<{ label: string; value: string }> = [
    { label: "Betrag", value: amountFormatted },
    { label: "Zahlungs-Datum", value: paymentDateFormatted },
    { label: "Zugang gültig bis", value: expiresAtFormatted },
  ];

  return (
    <Layout
      preview="Ihr narravit-Portal-Zugang ist freigeschaltet."
      headerEyebrow="Willkommen"
      siteUrl={siteUrl}
    >
      <MailHeading>Ihr Portal-Zugang ist freigeschaltet</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        herzlich willkommen bei narravit. Ihre Zahlung ist eingegangen — ab
        sofort können Sie Ihre Lebensgeschichte schreiben oder am Telefon
        erzählen lassen. <strong>10 Stunden Vapi-Erzählzeit</strong> sind in
        Ihrem Zugang bereits enthalten.
      </MailParagraph>

      <MailDetailsList items={details} />

      <MailCtaButton href={personalAreaUrl}>
        Zum persönlichen Bereich
      </MailCtaButton>

      <MailParagraph>
        Ihr Portal-Zugang ist <strong>12 Monate</strong> gültig. Rechtzeitig
        vor dem Ablauf erinnern wir Sie an die Verlängerung.
        {invoiceUrl ? (
          <>
            {" "}
            Ihre Rechnung finden Sie{" "}
            <a
              href={invoiceUrl}
              style={{ color: "#3E3831", textDecoration: "underline" }}
            >
              hier
            </a>
            .
          </>
        ) : null}
      </MailParagraph>
    </Layout>
  );
}
