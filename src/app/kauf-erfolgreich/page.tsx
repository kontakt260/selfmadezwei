import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getStripe } from "@/lib/stripe/server";
import { isCheckoutPaid } from "@/lib/stripe/payment-status";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isGuestSession } from "@/lib/purchases/guest-purchase";

// Erfolgsseite nach Stripe-Hosted-Checkout (PROJ-6).
//
// Verifiziert die `session_id` SERVER-SEITIG gegen die Stripe-API.
// Wir lesen NICHT aus der DB — der Webhook könnte noch nicht
// eingetroffen sein (Stripe garantiert keine Reihenfolge zwischen
// Browser-Redirect und Webhook-Call). Stripe ist die definitive
// Wahrheit, die DB ist eventually consistent.
//
// Kauf ohne Konto (2026-11-16): Die Seite ist öffentlich. Wer als Gast
// bezahlt hat, sieht hier die Bitte, jetzt sein Konto anzulegen — erst
// damit wird der Kauf über /kauf-einloesen zugeordnet und das Projekt
// freigeschaltet. Die `session_id` ist ein langes Zufalls-Kennzeichen von
// Stripe und nur dem Browser des Käufers bekannt; sie berechtigt allein
// zum Ansehen dieser Seite, nicht zum Einlösen.

type Variant =
  | { type: "initial-self" }
  // Geschenk, gift_mode = "phone-only": Käufer bleibt Projektleiter,
  // beschenkte Person erzählt per Sprachnachricht, kein Portal-Login für sie.
  // Kontaktweg der Person wird erst mit PROJ-12 abgefragt — deshalb nur
  // ihr Name.
  | { type: "initial-gift-phone-only"; recipientName: string }
  // Geschenk, gift_mode = "phone-plus-computer" (beide Sub-Varianten —
  // mit oder ohne buyer_retains_access). Für den Empfänger wurde eine
  // Einladungs-Mail verschickt; die Bestätigung hebt das hervor.
  | {
      type: "initial-gift-phone-computer";
      recipientEmail: string;
      buyerRetainsAccess: boolean;
    }
  | { type: "renewal"; projectId: string };

type VerifiedSession = {
  variant: Variant;
  /** Verzögerte Zahlart (z. B. SEPA): Das Geld ist noch nicht eingegangen. */
  paymentPending: boolean;
  /** Kauf wurde ohne Anmeldung gestartet. */
  isGuest: boolean;
  /** E-Mail-Adresse aus dem Checkout (für die Konto-Anlage vorbelegt). */
  buyerEmail: string;
};

async function verifyStripeSession(sessionId: string): Promise<VerifiedSession | null> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete") return null;
    const paid = isCheckoutPaid(session);
    if (!paid && session.payment_status !== "unpaid") return null;
    const meta = session.metadata ?? {};
    const productType = meta.product_type;
    const base = {
      paymentPending: !paid,
      isGuest: isGuestSession(session),
      buyerEmail:
        session.customer_details?.email?.trim() || session.customer_email?.trim() || "",
    };
    if (productType === "initial") {
      if (meta.is_gift === "1") {
        const recipientEmail = meta.gift_recipient_email ?? "";
        const giftMode = meta.gift_mode;
        if (giftMode === "phone-only") {
          const recipientName = meta.gift_recipient_name?.trim() ?? "";
          return { ...base, variant: { type: "initial-gift-phone-only", recipientName } };
        }
        // gift_mode === "phone-plus-computer" — beide Sub-Modi auf
        // einer gemeinsamen Bestätigungsseite, die das Mail-Versenden
        // hervorhebt.
        return {
          ...base,
          variant: {
            type: "initial-gift-phone-computer",
            recipientEmail,
            buyerRetainsAccess: meta.buyer_retains_access === "1",
          },
        };
      }
      return { ...base, variant: { type: "initial-self" } };
    }
    if (productType === "renewal" && meta.project_id) {
      return { ...base, variant: { type: "renewal", projectId: meta.project_id } };
    }
    return null;
  } catch {
    return null;
  }
}

// Ist dieser Gast-Kauf schon dem angegebenen Konto zugeordnet?
async function isClaimedBy(sessionId: string, userId: string): Promise<boolean> {
  try {
    const { data } = await createServiceRoleClient()
      .from("purchase_claims")
      .select("claimed_by")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    return data?.claimed_by === userId;
  } catch {
    return false;
  }
}

export default async function KaufErfolgreichPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/");

  const verified = await verifyStripeSession(session_id);
  if (!verified) redirect("/");
  const { variant, isGuest, buyerEmail, paymentPending } = verified;

  // Erst wenn das Geld da ist, wird der Kauf erfüllt (Webhook) — bis dahin
  // weder einlösen noch „Zugang aktiv" anzeigen.
  if (paymentPending) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16">
        <div className="flex w-full max-w-xl flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center sm:p-12">
          <Image src="/logo.svg" alt="NARRAVIT" width={64} height={56} className="h-14 w-auto" />
          <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
            Ihre Zahlung wird bearbeitet
          </h1>
          <p className="text-lg leading-8 text-[#535252]">
            Vielen Dank für Ihren Kauf. Bei dieser Zahlart dauert der Eingang
            einige Tage. Sobald die Zahlung bei uns angekommen ist, bekommen
            Sie eine E-Mail mit den nächsten Schritten.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isGuest && !user) {
    // Kauf eines angemeldeten Kontos: Bestätigung nur nach Anmeldung.
    redirect("/anmelden");
  }

  if (isGuest && user && !(await isClaimedBy(session_id, user.id))) {
    // Angemeldet, aber der Kauf ist diesem Konto noch nicht zugeordnet →
    // jetzt einlösen. Gelingt das, führt /kauf-einloesen hierher zurück.
    redirect("/kauf-einloesen");
  }

  if (isGuest && !user) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16">
        <div className="flex w-full max-w-xl flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center sm:p-12">
          <Image src="/logo.svg" alt="NARRAVIT" width={64} height={56} className="h-14 w-auto" />
          <SuccessIcon />
          <GuestAccountContent variant={variant} buyerEmail={buyerEmail} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center sm:p-12">
        <Image src="/logo.svg" alt="NARRAVIT" width={64} height={56} className="h-14 w-auto" />
        <SuccessIcon />
        {variant.type === "initial-self" && <InitialSelfContent />}
        {variant.type === "initial-gift-phone-only" && (
          <InitialGiftPhoneOnlyContent recipientName={variant.recipientName} />
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
      </div>
    </main>
  );
}

// Gast hat bezahlt, hat aber noch kein Konto: nächster Schritt ist die
// Konto-Anlage. Danach wird der Kauf automatisch zugeordnet.
function GuestAccountContent({
  variant,
  buyerEmail,
}: {
  variant: Variant;
  buyerEmail: string;
}) {
  const query = new URLSearchParams({ next: "/kauf-einloesen" });
  if (buyerEmail) query.set("email", buyerEmail);
  const registerHref = `/registrieren?${query.toString()}`;
  const loginHref = `/anmelden?${query.toString()}`;

  const isGiftWithInvitation = variant.type === "initial-gift-phone-computer";
  const isGift = isGiftWithInvitation || variant.type === "initial-gift-phone-only";

  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Vielen Dank — Ihre Zahlung ist eingegangen
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        {isGift
          ? "Nur noch ein Schritt: Legen Sie jetzt Ihr Konto an, damit wir Ihr Geschenk einrichten können."
          : "Nur noch ein Schritt: Legen Sie jetzt Ihr Konto an, dann können Sie sofort mit Ihrem Lebensbuch beginnen."}
      </p>
      {isGiftWithInvitation ? (
        <p className="border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
          Die Einladung an{" "}
          <span className="font-semibold">
            {variant.recipientEmail || "die beschenkte Person"}
          </span>{" "}
          verschicken wir, sobald Ihr Konto angelegt ist.
        </p>
      ) : null}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href={registerHref}
          className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
        >
          Konto erstellen
        </Link>
        <Link
          href={loginHref}
          className="inline-flex h-12 items-center justify-center border border-[#e0dcd5] bg-white px-6 text-lg font-bold text-[#3E3831] transition-colors hover:border-[#96B897]"
        >
          Ich habe bereits ein Konto
        </Link>
      </div>
      <p className="text-base leading-7 text-[#535252]">
        {buyerEmail ? (
          <>
            Wir haben Ihnen zusätzlich eine E-Mail an{" "}
            <span className="font-semibold">{buyerEmail}</span> geschickt — Sie
            können Ihr Konto auch später über den Link darin anlegen.
          </>
        ) : (
          <>
            Wir haben Ihnen zusätzlich eine E-Mail geschickt — Sie können Ihr
            Konto auch später über den Link darin anlegen.
          </>
        )}
      </p>
    </>
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
        Lebensbuchs. Ihr Portal-Zugang gilt 12 Monate.
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
  recipientName,
}: {
  recipientName: string;
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
        {recipientName ? (
          <>
            <span className="font-semibold">{recipientName}</span> erzählt
            die Geschichten per Sprachnachricht — ein eigener Portal-Zugang
            ist dafür nicht nötig.
          </>
        ) : (
          <>
            Ihre beschenkte Person erzählt ihre Geschichten per
            Sprachnachricht — ein eigener Portal-Zugang ist für sie nicht
            nötig.
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
        beschenkte Person geschickt — sobald sie sie annimmt, kann sie
        selbst im Portal schreiben.
      </p>
      <p className="border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
        Einladungs-Mail unterwegs an{" "}
        <span className="font-semibold">
          {recipientEmail || "die angegebene Adresse"}
        </span>
        . Die Einladung bleibt gültig, solange der Portal-Zugang läuft.
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
        Ihr Projekt-Zugang wurde um 12 Monate verlängert.
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
