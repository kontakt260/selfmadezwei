import { PortalPurchaseEmail } from "../PortalPurchaseEmail";

const siteUrl = "https://app.narravit.de";

// Geschenk „Nur per Sprachnachricht erzählen": Käufer ist Projektleiter,
// keine Einladung — die Mail nennt die beschenkte Person beim Namen.
export default function Preview() {
  return (
    <PortalPurchaseEmail
      fullName="Lena Muster"
      amountFormatted="249,00 €"
      paymentDateFormatted="14. Oktober 2026"
      expiresAtFormatted="14. Oktober 2027"
      siteUrl={siteUrl}
      projectId="beispiel"
      giftRecipientName="Oma Erna"
    />
  );
}
