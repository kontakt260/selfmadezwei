// PROJ-11 — Portal-Kauf-Bestätigung (Erstkauf).
//
// Trigger: Stripe-Webhook checkout.session.completed mit
// payment_type = initial_portal_access (PROJ-6).
//
// Drei Fälle:
//   - Kauf für sich selbst bzw. Geschenk mit eigenem Zugang: „Ihr
//     Portal-Zugang ist freigeschaltet" (+ Hinweis auf die Einladung an die
//     beschenkte Person, falls eine verschickt wurde).
//   - Geschenk ohne eigenen Zugang (`buyerHasAccess = false`): Der Käufer ist
//     kein Projektmitglied — die Mail bestätigt Zahlung und Geschenk, ohne
//     auf einen Portal-Zugang zu verweisen.

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
  /** Adresse der beschenkten Person, an die eine Einladung ging */
  giftRecipientEmail?: string;
  /** false = Geschenk ohne eigenen Portal-Zugang des Käufers */
  buyerHasAccess?: boolean;
};

function InvoiceHint({ invoiceUrl }: { invoiceUrl?: string }) {
  if (!invoiceUrl) return null;
  return (
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
  );
}

export function PortalPurchaseEmail({
  fullName,
  amountFormatted,
  paymentDateFormatted,
  expiresAtFormatted,
  invoiceUrl,
  siteUrl,
  giftRecipientEmail,
  buyerHasAccess = true,
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

  if (!buyerHasAccess) {
    const recipient = giftRecipientEmail ?? "die beschenkte Person";
    return (
      <Layout
        preview="Vielen Dank — Ihr narravit-Geschenk ist unterwegs."
        headerEyebrow="Geschenk"
        siteUrl={siteUrl}
      >
        <MailHeading>Ihr Geschenk ist unterwegs</MailHeading>
        <MailParagraph>{greeting}</MailParagraph>
        <MailParagraph>
          vielen Dank für Ihren Kauf. Ihre Zahlung ist eingegangen, und wir
          haben <strong>{recipient}</strong> eine Einladung geschickt. Mit
          dem Link darin nimmt die beschenkte Person das Lebensbuch an und
          kann sofort mit dem Erzählen beginnen.
        </MailParagraph>

        <MailDetailsList items={details} />

        <MailParagraph>
          Die Einladung ist 14 Tage gültig. Wie gewünscht haben Sie selbst
          keinen Zugang zum Projekt — die beschenkte Person kann Sie später
          jederzeit als Co-Autorin oder Co-Autor dazuholen.
          <InvoiceHint invoiceUrl={invoiceUrl} />
        </MailParagraph>
      </Layout>
    );
  }

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
        sofort können Sie Ihre Lebensgeschichte schreiben oder per
        Sprachnachricht erzählen lassen. <strong>Das Erzählen</strong> ist in
        Ihrem Zugang bereits enthalten.
      </MailParagraph>

      <MailDetailsList items={details} />

      {giftRecipientEmail ? (
        <MailParagraph>
          Die Einladung an <strong>{giftRecipientEmail}</strong> ist
          unterwegs. Sie ist 14 Tage gültig.
        </MailParagraph>
      ) : null}

      <MailCtaButton href={personalAreaUrl}>
        Zum persönlichen Bereich
      </MailCtaButton>

      <MailParagraph>
        Ihr Portal-Zugang ist <strong>12 Monate</strong> gültig. Rechtzeitig
        vor dem Ablauf erinnern wir Sie an die Verlängerung.
        <InvoiceHint invoiceUrl={invoiceUrl} />
      </MailParagraph>
    </Layout>
  );
}
