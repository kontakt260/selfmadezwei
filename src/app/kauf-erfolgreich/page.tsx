import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getStripe } from "@/lib/stripe/server";

// Erfolgsseite nach Stripe-Hosted-Checkout (PROJ-6).
//
// Verifiziert die `session_id` SERVER-SEITIG gegen die Stripe-API.
// Wir lesen NICHT aus der DB — der Webhook könnte noch nicht
// eingetroffen sein (Stripe garantiert keine Reihenfolge zwischen
// Browser-Redirect und Webhook-Call). Stripe ist die definitive
// Wahrheit, die DB ist eventually consistent.

type Variant =
  | { type: "initial-self" }
  // Geschenk, gift_mode = "phone-only": Käufer bleibt Projektleiter,
  // beschenkte Person erzählt am Telefon, kein Portal-Login für sie.
  | { type: "initial-gift-phone-only"; recipientEmail: string }
  // Geschenk, gift_mode = "phone-plus-computer" (beide Sub-Varianten —
  // mit oder ohne buyer_retains_access). Für den Empfänger wurde eine
  // Einladungs-Mail verschickt; die Bestätigung hebt das hervor.
  | {
      type: "initial-gift-phone-computer";
      recipientEmail: string;
      buyerRetainsAccess: boolean;
    }
  | { type: "renewal"; projectId: string }
  | { type: "vapi"; projectId: string };

async function verifyStripeSession(sessionId: string): Promise<Variant | null> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete" || session.payment_status !== "paid") {
      return null;
    }
    const meta = session.metadata ?? {};
    const productType = meta.product_type;
    if (productType === "initial") {
      if (meta.is_gift === "1") {
        const recipientEmail = meta.gift_recipient_email ?? "";
        const giftMode = meta.gift_mode;
        if (giftMode === "phone-only") {
          return { type: "initial-gift-phone-only", recipientEmail };
        }
        // gift_mode === "phone-plus-computer" — beide Sub-Modi auf
        // einer gemeinsamen Bestätigungsseite, die das Mail-Versenden
        // hervorhebt.
        return {
          type: "initial-gift-phone-computer",
          recipientEmail,
          buyerRetainsAccess: meta.buyer_retains_access === "1",
        };
      }
      return { type: "initial-self" };
    }
    if (productType === "renewal" && meta.project_id) {
      return { type: "renewal", projectId: meta.project_id };
    }
    if (productType === "vapi" && meta.project_id) {
      return { type: "vapi", projectId: meta.project_id };
    }
    return null;
  } catch {
    return null;
  }
}

export default async function KaufErfolgreichPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/");

  const variant = await verifyStripeSession(session_id);
  if (!variant) redirect("/");

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center sm:p-12">
        <Image src="/logo.svg" alt="NARRAVIT" width={64} height={56} className="h-14 w-auto" />
        <SuccessIcon />
        {variant.type === "initial-self" && <InitialSelfContent />}
        {variant.type === "initial-gift-phone-only" && (
          <InitialGiftPhoneOnlyContent recipientEmail={variant.recipientEmail} />
        )}
        {variant.type === "initial-gift-phone-computer" && (
          <InitialGiftPhoneComputerContent
            recipientEmail={variant.recipientEmail}
            buyerRetainsAccess={variant.buyerRetainsAccess}
          />
        )}
        {variant.type === "renewal" && (
          <RenewalContent projectId={variant.projectId} />
        )}
        {variant.type === "vapi" && (
          <VapiContent projectId={variant.projectId} />
        )}
      </div>
    </main>
  );
}

function InitialSelfContent() {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Willkommen bei NARRAVIT!
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        Ihr Zugang ist aktiv — viel Freude beim Schreiben Ihres
        Lebensbuchs. 10 Stunden Telefon-Erzählzeit sind inklusive, Ihr
        Portal-Zugang gilt 12 Monate.
      </p>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
      >
        Jetzt starten
      </Link>
    </>
  );
}

function InitialGiftPhoneOnlyContent({
  recipientEmail,
}: {
  recipientEmail: string;
}) {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Geschenk aktiviert
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        Vielen Dank für Ihren Kauf. Das Geschenk-Projekt ist freigeschaltet
        — Sie sind als Projektleiter:in eingetragen und können die
        Geschichten Ihrer beschenkten Person im Portal lesen.
      </p>
      <p className="border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
        {recipientEmail ? (
          <>
            Ihre beschenkte Person (
            <span className="font-semibold">{recipientEmail}</span>) kann ab
            sofort am Telefon erzählen. Geben Sie ihr einfach die
            Telefonnummer, die Sie in der Projektübersicht finden — ein
            eigener Portal-Zugang ist für sie nicht nötig.
          </>
        ) : (
          <>
            Ihre beschenkte Person kann ab sofort am Telefon erzählen.
            Geben Sie ihr die Telefonnummer, die Sie in der
            Projektübersicht finden — ein eigener Portal-Zugang ist für
            sie nicht nötig.
          </>
        )}
      </p>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
      >
        Zur Startseite
      </Link>
    </>
  );
}

function InitialGiftPhoneComputerContent({
  recipientEmail,
  buyerRetainsAccess,
}: {
  recipientEmail: string;
  buyerRetainsAccess: boolean;
}) {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Geschenk verschickt
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        Vielen Dank für Ihren Kauf. Wir haben eine Einladung an Ihre
        beschenkte Person geschickt — sobald sie sie annimmt, kann sie am
        Telefon erzählen oder selbst im Portal schreiben.
      </p>
      <p className="border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
        Einladungs-Mail unterwegs an{" "}
        <span className="font-semibold">
          {recipientEmail || "die angegebene Adresse"}
        </span>
        . Die Einladung ist 14 Tage gültig.
      </p>
      <p className="text-base leading-7 text-[#535252]">
        {buyerRetainsAccess ? (
          <>
            Sie sind ebenfalls als Projektleiter:in eingetragen und können
            jederzeit mitschreiben oder die Geschichten lesen.
          </>
        ) : (
          <>
            Sie haben sich entschieden, keinen eigenen Portal-Zugang zu
            behalten — die Schreibrechte liegen ausschließlich bei Ihrer
            beschenkten Person. Sie können später als Co-Autor:in
            eingeladen werden, falls Sie doch mitschreiben möchten.
          </>
        )}
      </p>
      {buyerRetainsAccess ? (
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
        >
          Zur Startseite
        </Link>
      ) : null}
    </>
  );
}

function RenewalContent({ projectId }: { projectId: string }) {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Kauf erfolgreich
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        Dein Projekt-Zugang wurde um 12 Monate verlängert.
      </p>
      <Link
        href={`/projektuebersicht/${projectId}`}
        className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
      >
        Zurück zum Projekt
      </Link>
    </>
  );
}

function VapiContent({ projectId }: { projectId: string }) {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Kauf erfolgreich
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        60 Minuten Telefonzeit wurden deinem Projekt gutgeschrieben.
      </p>
      <Link
        href={`/projektuebersicht/${projectId}`}
        className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
      >
        Zurück zum Projekt
      </Link>
    </>
  );
}

function SuccessIcon() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#96B897]/20">
      <svg
        width={32}
        height={32}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3E3831"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  );
}
