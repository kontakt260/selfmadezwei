// PROJ-11 — Vapi-60-Min-Paket-Kauf-Bestätigung.
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = vapi_voice_minutes_60 (PROJ-6).

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type VapiPackagePurchaseEmailProps = {
  fullName?: string;
  projectName: string;
  /** Bezahlter Betrag, z. B. „19,00 €" */
  amountFormatted: string;
  paymentDateFormatted: string;
  /** Falls aus Webhook bekannt: aktueller Vapi-Minuten-Saldo nach Top-Up */
  remainingMinutes?: number;
  /** Projektübersicht-URL (relativ zur Site-Base) */
  siteUrl: string;
  projectId: string;
};

export function VapiPackagePurchaseEmail({
  fullName,
  projectName,
  amountFormatted,
  paymentDateFormatted,
  remainingMinutes,
  siteUrl,
  projectId,
}: VapiPackagePurchaseEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const projectUrl = `${siteUrl}/projektuebersicht/${projectId}`;

  const details: Array<{ label: string; value: string }> = [
    { label: "Projekt", value: projectName },
    { label: "Aufgeladen", value: "+60 Minuten" },
    { label: "Betrag", value: amountFormatted },
    { label: "Datum", value: paymentDateFormatted },
  ];
  if (typeof remainingMinutes === "number") {
    details.push({
      label: "Aktueller Saldo",
      value: `${remainingMinutes} Minuten`,
    });
  }

  return (
    <Layout
      preview={`+60 Minuten Vapi-Erzählzeit wurden Ihrem Projekt „${projectName}" hinzugefügt.`}
      headerEyebrow="Telefon-Erzählzeit"
      siteUrl={siteUrl}
    >
      <MailHeading>+60 Minuten Erzählzeit hinzugefügt</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        die Aufladung Ihrer Vapi-Erzählzeit für das Projekt{" "}
        <strong>„{projectName}"</strong> war erfolgreich.{" "}
        <strong>60 Minuten</strong> sind ab sofort verfügbar.
      </MailParagraph>

      <MailDetailsList items={details} />

      <MailCtaButton href={projectUrl}>Zur Projektübersicht</MailCtaButton>

      <MailParagraph>
        Hinweis: Die zugekaufte Erzählzeit steht so lange zur Verfügung,
        wie Ihr Portal-Zugang gültig ist.
      </MailParagraph>
    </Layout>
  );
}
