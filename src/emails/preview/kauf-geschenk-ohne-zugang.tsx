import { PortalPurchaseEmail } from "../PortalPurchaseEmail";

const siteUrl = "https://app.narravit.de";

export default function Preview() {
  return (
    <PortalPurchaseEmail
      fullName="Lena Muster"
      amountFormatted="249,00 €"
      paymentDateFormatted="14. Oktober 2026"
      expiresAtFormatted="14. Oktober 2027"
      siteUrl={siteUrl}
      giftRecipientEmail="oma@example.de"
      buyerHasAccess={false}
    />
  );
}
