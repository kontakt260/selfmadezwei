import Image from "next/image";
import type { ReactNode } from "react";

// Vollbild-Screen mit weichgezeichnetem Foto im Hintergrund und einer weißen
// Karte mit dem NARRAVIT-Logo darüber.
//
// Jeder Bereich hat einen eigenen Eintrag. Bis eigene Motive da sind, zeigen
// alle das Strandfoto; ein neues Bild wird nur hier eingetragen.
const BACKDROPS = {
  /** Einladung annehmen */
  einladung: "/images/mail/willkommen-strand.jpg",
  /** Abschluss eines Geschenk-Kaufs */
  geschenk: "/images/mail/willkommen-strand.jpg",
  /** Abschluss von Kauf und Verlängerung, Konto anlegen */
  kauf: "/images/mail/willkommen-strand.jpg",
  /** Hinweis: Editor nicht auf dem Smartphone */
  smartphone: "/images/mail/willkommen-strand.jpg",
} as const;

export type BackdropKey = keyof typeof BACKDROPS;

export function BackdropScreen({
  backdrop,
  children,
}: {
  backdrop: BackdropKey;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#3E3831] px-4 py-12 [font-family:var(--font-lato)] sm:px-6 sm:py-16">
      <Image
        src={BACKDROPS[backdrop]}
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
