import Image from "next/image";
import type { ReactNode } from "react";

// Rahmen der Einladungs-Seite: Strandfoto aus der Willkommens-Mail weich
// gezeichnet im Hintergrund, darüber die Karte mit dem NARRAVIT-Logo.

export function InvitationCard({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#3E3831] px-4 py-12 sm:px-6 sm:py-16">
      <Image
        src="/images/mail/willkommen-strand.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-105 object-cover blur-[3px]"
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#3E3831]/20" aria-hidden />
      <div className="relative flex w-full max-w-xl flex-col gap-6 border border-[#e0dcd5] bg-white p-6 sm:gap-8 sm:p-10">
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo.svg" alt="" width={90} height={80} className="h-16 w-auto" aria-hidden />
          <p className="[font-family:var(--font-merriweather)] text-2xl font-light text-[#2D372D]">
            NARRAVIT
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function InvitationHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-center [font-family:var(--font-merriweather)] text-2xl text-[#3E3831] sm:text-3xl">
      {children}
    </h1>
  );
}

export function InvitationPreview({
  title,
  role,
  inviter,
  email,
}: {
  title: string;
  /** Bei Geschenken bewusst nicht angezeigt. */
  role?: string;
  inviter?: string;
  email: string;
}) {
  const rows = [
    role ? { label: "Rolle", value: role } : null,
    inviter ? { label: "Eingeladen von", value: inviter } : null,
    { label: "Für", value: email },
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <div className="flex flex-col gap-2">
      <p className="[font-family:var(--font-pt-serif)] text-xl text-[#3E3831] sm:text-2xl">
        {title}
      </p>
      <dl className="grid grid-cols-1 gap-2 text-base leading-7 text-[#535252] sm:text-lg">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-row gap-3">
            <dt className="w-28 shrink-0 font-semibold text-[#3E3831]">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
