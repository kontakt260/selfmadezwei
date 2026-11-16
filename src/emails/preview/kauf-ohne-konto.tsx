import { GuestPurchaseEmail } from "../GuestPurchaseEmail";

const siteUrl = "https://stage-app.narravit.de";

export default function Preview() {
  return (
    <GuestPurchaseEmail
      fullName="Maria Muster"
      buyerEmail="maria.muster@example.com"
      amountFormatted="249,00 €"
      paymentDateFormatted="16. November 2026"
      siteUrl={siteUrl}
    />
  );
}
