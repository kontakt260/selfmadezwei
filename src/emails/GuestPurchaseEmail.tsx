// PROJ-6/PROJ-11 — Kauf-Bestätigung für Käufe ohne Konto.
//
// Trigger: Stripe-Webhook checkout.session.completed für einen Erstkauf,
// bei dem der Käufer nicht angemeldet war (Checkout vor Registrierung,
// 2026-11-16). Die Mail bestätigt die Zahlung und führt zum Anlegen des
// Kontos — erst damit wird das Lebensbuch freigeschaltet.
//
// Der Kauf wird dem Konto automatisch zugeordnet, wenn es mit derselben
// E-Mail-Adresse angelegt wird, an die diese Mail geht. Deshalb nennt die
// Mail die Adresse ausdrücklich.

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type GuestPurchaseEmailProps = {
  /** Name aus dem Kauf-Assistenten; leer = Fallback „Hallo," */
  fullName?: string;
  /** Adresse aus dem Checkout — mit ihr soll das Konto angelegt werden */
  buyerEmail: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  /** Kauf als Geschenk */
  isGift?: boolean;
  /** Optional: Link zur Stripe-Rechnung */
  invoiceUrl?: string;
  siteUrl: string;
};

const linkStyle = { color: "#3E3831", textDecoration: "underline" } as const;

export function GuestPurchaseEmail({
  fullName,
  buyerEmail,
  amountFormatted,
  paymentDateFormatted,
  isGift = false,
  invoiceUrl,
  siteUrl,
}: GuestPurchaseEmailProps) {
  const greeting = fullName?.trim() ? `Hallo ${fullName.trim()},` : "Hallo,";
  const registerUrl = `${siteUrl}/registrieren?next=%2Fkauf-einloesen`;
  const loginUrl = `${siteUrl}/anmelden?next=%2Fkauf-einloesen`;

  return (
    <Layout
      preview="Ihre Zahlung ist eingegangen — bitte legen Sie jetzt Ihr narravit-Konto an."
      headerEyebrow="Bestätigung"
      siteUrl={siteUrl}
    >
      <MailHeading>Nur noch ein Schritt: Ihr Konto</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>
        vielen Dank für Ihren Kauf — Ihre Zahlung ist eingegangen.{" "}
        {isGift ? (
          <>
            Damit wir Ihr Geschenk einrichten können, legen Sie bitte jetzt
            Ihr narravit-Konto an.
          </>
        ) : (
          <>
            Damit Sie mit Ihrem Lebensbuch beginnen können, legen Sie bitte
            jetzt Ihr narravit-Konto an.
          </>
        )}
      </MailParagraph>

      <MailDetailsList
        items={[
          { label: "Betrag", value: amountFormatted },
          { label: "Zahlungs-Datum", value: paymentDateFormatted },
          { label: "Portal-Zugang", value: "12 Monate ab Einrichtung Ihres Kontos" },
        ]}
      />

      <MailCtaButton href={registerUrl}>Konto anlegen</MailCtaButton>

      <MailParagraph>
        Bitte verwenden Sie dabei die E-Mail-Adresse{" "}
        <strong>{buyerEmail}</strong> — so ordnen wir Ihren Kauf automatisch
        Ihrem Konto zu. Sie haben bereits ein Konto? Dann{" "}
        <a href={loginUrl} style={linkStyle}>
          melden Sie sich hier an
        </a>
        .
      </MailParagraph>

      {invoiceUrl ? (
        <MailParagraph>
          Ihre Rechnung finden Sie{" "}
          <a href={invoiceUrl} style={linkStyle}>
            hier
          </a>
          .
        </MailParagraph>
      ) : null}
    </Layout>
  );
}
