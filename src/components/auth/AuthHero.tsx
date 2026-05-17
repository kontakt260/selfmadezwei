"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

const AUTH_ROUTES = [
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/email-bestaetigen",
  "/zugang-abgelaufen",
] as const;

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AuthHero() {
  const pathname = usePathname() ?? "";

  if (!isAuthRoute(pathname)) return null;

  return (
    <aside className="pointer-events-none fixed inset-y-0 right-0 z-[5] hidden min-w-[30rem] w-[59%] items-center justify-center overflow-hidden border-l border-[#e0dcd5] bg-[#f1ede7] lg:flex">
      <Image
        src="/images/auth-hero-tree.png"
        alt=""
        fill
        className="scale-[1.01] object-cover blur-[2px]"
        sizes="59vw"
        priority
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#3E3831]/25" />
      <div className="relative mx-12 max-w-[39rem] border border-[#e0dcd5] bg-[#FAF8F6]/90 p-14 xl:p-16">
        <Image
          src="/logo.svg"
          alt=""
          width={176}
          height={176}
          className="mb-10 h-32 w-32 object-contain xl:h-40 xl:w-40"
          aria-hidden
        />
        <p className="mb-6 [font-family:var(--font-merriweather)] text-5xl leading-tight text-[#3E3831] xl:text-6xl">
          Weil jedes Leben{" "}
          <span className="text-[#708ca4]">ein Buch wert ist.</span>
        </p>
        <p className="text-lg leading-8 text-[#535252]">
          Mit NARRAVIT können Sie Ihre Geschichten ganz einfach festhalten.
        </p>
      </div>
    </aside>
  );
}
