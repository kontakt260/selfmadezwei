import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// Erfolgsseite nach Stripe-Hosted-Checkout (PROJ-6).
//
// Der Nutzer landet hier nach erfolgreicher Zahlung. Die URL enthält
// eine `session_id` von Stripe, die wir SERVER-SEITIG gegen die
// Stripe-API verifizieren — wir lesen NICHT aus der DB, weil der
// Webhook möglicherweise noch nicht eingetroffen ist (Stripe garantiert
// keine Reihenfolge zwischen Browser-Redirect und Webhook-Call).
//
// Die ServerComponent prüft:
//   - session_id existiert in der URL → sonst Redirect auf /
//   - Stripe-Session ist tatsächlich completed/paid → sonst Redirect auf /
//   - product_type aus session.metadata → bestimmt welche der 3 Varianten
//     gerendert wird:
//       (a) Initial-Selbst   → "Willkommen bei NARRAVIT!" + → /
//       (b) Initial-Geschenk → "Einladung verschickt an …" + → /
//       (c) Renewal/Vapi     → "Kauf erfolgreich" + → /projektuebersicht/{pid}
//
// PROJ-6 Frontend-Phase: Stripe-API-Call ist gestubbed (gibt synthetische
// Metadata zurück); in /backend wird das durch echten
// `stripe.checkout.sessions.retrieve(session_id)` ersetzt.

type Variant =
  | { type: "initial-self" }
  | { type: "initial-gift"; recipientEmail: string }
  | { type: "renewal"; projectId: string }
  | { type: "vapi"; projectId: string };

async function verifyStripeSessionStub(sessionId: string): Promise<Variant | null> {
  // PROJ-6 Frontend-Stub: in /backend ersetzt durch:
  //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  //   const session = await stripe.checkout.sessions.retrieve(sessionId);
  //   if (session.status !== "complete" || session.payment_status !== "paid") {
  //     return null;
  //   }
  //   const meta = session.metadata;
  //   ... daraus Variant ableiten
  //
  // Für die Frontend-Phase: wenn die session_id den Stub-Prefix "stub_"
  // hat, parsen wir den Rest als URL-encodiertes JSON. Das erlaubt
  // lokale Tests aller 3 Bestätigungs-Varianten ohne Stripe-Account.
  if (!sessionId.startsWith("stub_")) return null;
  try {
    const json = decodeURIComponent(sessionId.slice("stub_".length));
    return JSON.parse(json) as Variant;
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

  const variant = await verifyStripeSessionStub(session_id);
  if (!variant) redirect("/");

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center sm:p-12">
        <Image src="/logo.svg" alt="NARRAVIT" width={64} height={56} className="h-14 w-auto" />
        <SuccessIcon />
        {variant.type === "initial-self" && <InitialSelfContent />}
        {variant.type === "initial-gift" && (
          <InitialGiftContent recipientEmail={variant.recipientEmail} />
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
        Dein Zugang ist aktiv — viel Freude beim Schreiben deines
        Lebensbuchs.
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

function InitialGiftContent({ recipientEmail }: { recipientEmail: string }) {
  return (
    <>
      <h1 className="[font-family:var(--font-merriweather)] text-3xl font-medium text-[#3E3831]">
        Willkommen bei NARRAVIT!
      </h1>
      <p className="text-lg leading-8 text-[#535252]">
        Dein Zugang ist aktiv — viel Freude beim Begleiten der
        Geschichten.
      </p>
      <p className="rounded border border-[#96B897]/40 bg-[#96B897]/10 p-4 text-base text-[#3E3831]">
        Die Einladung wurde an{" "}
        <span className="font-semibold">{recipientEmail}</span>{" "}
        verschickt — sobald sie angenommen wird, kann die beschenkte
        Person loslegen.
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
