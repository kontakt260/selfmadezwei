// PROJ-11 — Portal-Kauf-Bestätigung (Erstkauf).
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = initial_portal_access (PROJ-6).
//
// Vier Fassungen (Texte: Figma-Frames 02, 03, 03b, 04 — Jakob, 2026-11-19):
//   - 02 Kauf für sich selbst: „Ihr Projektzugang ist freigeschaltet".
//   - 03 Geschenk mit eigenem Zugang, Einladung an die beschenkte Person:
//     „Ihr Geschenk ist unterwegs", nennt die Adresse.
//   - 03b Geschenk „Nur per Sprachnachricht erzählen": keine Einladung,
//     nennt die beschenkte Person beim Namen (Kontaktweg kommt mit PROJ-12).
//   - 04 Geschenk ohne eigenen Zugang (`buyerHasAccess = false`): Der Käufer
//     ist kein Projektmitglied — die Mail bestätigt Zahlung und Geschenk,
//     ohne Button ins Portal.

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
  mailLinkStyle,
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
  /** Neu angelegtes Projekt — Ziel des Buttons „Zur Projektübersicht" */
  projectId?: string;
  /** Adresse der beschenkten Person, an die eine Einladung ging */
  giftRecipientEmail?: string;
  /**
   * Name der beschenkten Person beim Geschenk „Nur per Sprachnachricht
   * erzählen" (keine Einladung, deshalb keine Adresse).
   */
  giftRecipientName?: string;
  /** false = Geschenk ohne eigenen Projektzugang des Käufers */
  buyerHasAccess?: boolean;
};

function InvoiceHint({ invoiceUrl }: { invoiceUrl?: string }) {
  if (!invoiceUrl) return null;
  return (
    <>
      {" "}
      Ihre Rechnung finden Sie{" "}
      <a href={invoiceUrl} style={mailLinkStyle}>
        hier
      </a>
      .
    </>
  );
}

export function PortalPurchaseEmail({
  fullName,
  amountFormatted,
  paymentDateFormatted,
  expiresAtFormatted,
  invoiceUrl,
  siteUrl,
  projectId,
  giftRecipientEmail,
  giftRecipientName,
  buyerHasAccess = true,
}: PortalPurchaseEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";
  const projectUrl = projectId
    ? `${siteUrl}/projektuebersicht/${encodeURIComponent(projectId)}`
    : `${siteUrl}/`;

  const details: Array<{ label: string; value: string }> = [
    { label: "Betrag", value: amountFormatted },
    { label: "Zahlungs-Datum", value: paymentDateFormatted },
    { label: "Zugang gültig bis", value: expiresAtFormatted },
  ];

  // 04 — Geschenk ohne eigenen Zugang
  if (!buyerHasAccess) {
    const recipient = giftRecipientEmail ?? "die beschenkte Person";
    return (
      <Layout
        preview="Vielen Dank — Ihr NARRAVIT-Geschenk ist unterwegs."
        headerEyebrow="Geschenk"
      >
        <MailHeading>Ihr Geschenk ist unterwegs</MailHeading>
        <MailParagraph>{greeting}</MailParagraph>
        <MailParagraph>
          vielen Dank für Ihren Kauf. Ihre Zahlung ist eingegangen und wir
          haben das Geschenk an <strong>{recipient}</strong> gesendet. Mit dem
          Link darin erhält die beschenkte Person Zugang zum Projekt und kann
          sofort mit dem Erzählen beginnen.
        </MailParagraph>

        <MailDetailsList items={details} />

        <MailParagraph>
          Wie bei der Bestellung gewünscht wurde, erhalten Sie selbst keinen
          Zugang zum Projekt und sehen nicht, was erzählt wird — die
          beschenkte Person kann Sie jedoch jederzeit als Co-Autorin oder
          Co-Autor dazuholen.
          <InvoiceHint invoiceUrl={invoiceUrl} />
        </MailParagraph>
      </Layout>
    );
  }

  const recipientName = giftRecipientName?.trim();
  const isGift = Boolean(giftRecipientEmail || recipientName);

  // 02 — Kauf für sich selbst
  if (!isGift) {
    return (
      <Layout
        preview="Ihr NARRAVIT-Projektzugang ist freigeschaltet."
        headerEyebrow="Willkommen"
      >
        <MailHeading>Ihr Projektzugang ist freigeschaltet</MailHeading>
        <MailParagraph>{greeting}</MailParagraph>
        <MailParagraph>
          herzlich willkommen bei NARRAVIT. Vielen Dank für Ihr Vertrauen.
          Ihre Zahlung ist eingegangen — ab sofort können Sie Ihre
          Lebensgeschichte schreiben oder per Sprachnachricht erzählen.
        </MailParagraph>

        <MailDetailsList items={details} />

        <MailCtaButton href={projectUrl}>Zur Projektübersicht</MailCtaButton>

        <MailParagraph>
          Ihr Projektzugang ist <strong>12 Monate</strong> gültig. Vor Ablauf
          erinnern wir Sie rechtzeitig an die Verlängerung.
          <InvoiceHint invoiceUrl={invoiceUrl} />
        </MailParagraph>
      </Layout>
    );
  }

  // 03 / 03b — Geschenk mit eigenem Zugang
  return (
    <Layout
      preview="Vielen Dank — Ihr NARRAVIT-Geschenk ist unterwegs."
      headerEyebrow="Willkommen"
    >
      <MailHeading>Ihr Geschenk ist unterwegs</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      {giftRecipientEmail ? (
        <MailParagraph>
          herzlich willkommen bei NARRAVIT. Vielen Dank für Ihr Vertrauen.
          Ihre Zahlung ist eingegangen und Ihr Geschenk ist unterwegs — vorab
          können Sie schon einmal einen Blick ins Projekt werfen oder selbst
          mit dem Erzählen beginnen.
        </MailParagraph>
      ) : (
        <>
          <MailParagraph>
            herzlich willkommen bei NARRAVIT. Vielen Dank für Ihr Vertrauen.
            Ihre Zahlung ist eingegangen und Ihr Geschenk ist unterwegs — von
            nun an erinnern wir die von Ihnen beschenkte Person mithilfe von
            tiefgehenden Fragen und spannenden Erinnerungshilfen wöchentlich
            an das Erzählen der Geschichte (per Mail oder SMS).
          </MailParagraph>
          <MailParagraph>
            In der Projektübersicht können Sie jederzeit Änderungen vornehmen,
            z. B. an der Frequenz der Erinnerungshilfen. Dort verwalten Sie
            zusätzlich das Projekt und geben den finalen Druckauftrag.
          </MailParagraph>
        </>
      )}

      <MailDetailsList items={details} />

      <MailParagraph>
        Das Geschenk an <strong>{giftRecipientEmail ?? recipientName}</strong>{" "}
        ist unterwegs.
      </MailParagraph>

      <MailCtaButton href={projectUrl}>Zur Projektübersicht</MailCtaButton>

      <MailParagraph>
        Ihr Projektzugang ist <strong>12 Monate</strong> gültig. Rechtzeitig
        vor dem Ablauf erinnern wir Sie an die Verlängerung.
        <InvoiceHint invoiceUrl={invoiceUrl} />
      </MailParagraph>
    </Layout>
  );
}
