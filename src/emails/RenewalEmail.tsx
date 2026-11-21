// PROJ-11 — Verlängerung des Projektzugangs (12-Monate-Renewal).
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = renewal_portal_access (PROJ-6).
//
// Zwei Fassungen (Anforderung Jakob 2026-11-19 — verlängern kann jedes
// Projektmitglied, die Information muss in beide Richtungen fließen;
// Texte: Figma-Frames 10 und 10b):
//   - Bestätigung an die Person, die bezahlt hat: Projekt, Betrag, Datum,
//     neues Ablaufdatum, Rechnung.
//   - Info an alle anderen Mitglieder (`renewedBy` gesetzt): wer verlängert
//     hat und bis wann der Zugang jetzt gilt — ohne Betrag und Rechnung.

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
  mailLinkStyle,
} from "./Layout";

type CommonProps = {
  fullName?: string;
  /** Projekttitel — erste Zeile der Detail-Box */
  projectName: string;
  /** Ziel des Buttons „Zur Projektübersicht" */
  projectId?: string;
  /** Neues Ablauf-Datum, z. B. „22. Mai 2027" */
  newExpiresAtFormatted: string;
  siteUrl: string;
};

type ConfirmationProps = CommonProps & {
  renewedBy?: undefined;
  amountFormatted: string;
  paymentDateFormatted: string;
  invoiceUrl?: string;
};

type InfoProps = CommonProps & {
  /** Name der Person, die verlängert hat */
  renewedBy: string;
};

export type RenewalEmailProps = ConfirmationProps | InfoProps;

export function RenewalEmail(props: RenewalEmailProps) {
  const { fullName, projectName, projectId, newExpiresAtFormatted, siteUrl } = props;
  const greeting = fullName?.trim() ? `Hallo ${fullName.trim()},` : "Hallo,";
  const projectUrl = projectId
    ? `${siteUrl}/projektuebersicht/${encodeURIComponent(projectId)}`
    : `${siteUrl}/`;

  // 10b — Info an die anderen Projektmitglieder
  if (props.renewedBy !== undefined) {
    const renewedBy = props.renewedBy.trim() || "Ein Projektmitglied";
    return (
      <Layout
        preview={`${renewedBy} hat den Projektzugang für „${projectName}“ verlängert. Neu gültig bis ${newExpiresAtFormatted}.`}
        headerEyebrow="Verlängerung"
      >
        <MailHeading>Ihr Projekt wurde verlängert</MailHeading>
        <MailParagraph>{greeting}</MailParagraph>
        <MailParagraph>
          <strong>{renewedBy}</strong> hat den Projektzugang für{" "}
          <strong>„{projectName}“</strong> um weitere{" "}
          <strong>12 Monate</strong> verlängert. Sie können wie gewohnt weiter
          schreiben und erzählen — für Sie ist nichts weiter zu tun.
        </MailParagraph>

        <MailDetailsList
          items={[
            { label: "Projekt", value: projectName },
            { label: "Neuer Zugang gültig bis", value: newExpiresAtFormatted },
          ]}
        />

        <MailCtaButton href={projectUrl}>Zur Projektübersicht</MailCtaButton>
      </Layout>
    );
  }

  // 10 — Bestätigung an die Person, die bezahlt hat
  const details: Array<{ label: string; value: string }> = [
    { label: "Projekt", value: projectName },
    { label: "Betrag", value: props.amountFormatted },
    { label: "Zahlungs-Datum", value: props.paymentDateFormatted },
    { label: "Neuer Zugang gültig bis", value: newExpiresAtFormatted },
  ];

  return (
    <Layout
      preview={`Ihr NARRAVIT-Projektzugang wurde um 12 Monate verlängert. Neu gültig bis ${newExpiresAtFormatted}.`}
      headerEyebrow="Verlängerung"
    >
      <MailHeading>Ihr Projekt wurde verlängert</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        vielen Dank — Ihr NARRAVIT-Projektzugang ist um weitere{" "}
        <strong>12 Monate</strong> verlängert. Sie können wie gewohnt weiter
        schreiben, einladen und erzählen.
      </MailParagraph>

      <MailDetailsList items={details} />

      {/* Steht immer da — die anderen Mitglieder bekommen Mail 10b. */}
      <MailParagraph>
        Falls es im Projekt noch weitere Mitglieder gibt, wurden sie per
        E-Mail über die Verlängerung informiert.
      </MailParagraph>

      <MailCtaButton href={projectUrl}>Zur Projektübersicht</MailCtaButton>

      {props.invoiceUrl ? (
        <MailParagraph>
          Ihre Rechnung finden Sie{" "}
          <a href={props.invoiceUrl} style={mailLinkStyle}>
            hier
          </a>
          .
        </MailParagraph>
      ) : null}
    </Layout>
  );
}
