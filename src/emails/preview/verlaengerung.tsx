import { RenewalEmail } from "../RenewalEmail";

const siteUrl = "https://app.narravit.de";

export default function Preview() {
  return (
    <RenewalEmail
      fullName="Maria Muster"
      amountFormatted="99,00 €"
      paymentDateFormatted="14. Oktober 2026"
      newExpiresAtFormatted="14. Oktober 2028"
      siteUrl={siteUrl}
    />
  );
}
