import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <section className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-[#FAF8F6] text-[#3E3831] lg:grid-cols-[minmax(0,0.82fr)_minmax(30rem,1.18fr)]">
      <header className="absolute left-0 right-0 top-0 z-20 flex h-28 items-center justify-between px-[5%]">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/logo.svg"
            alt=""
            width={86}
            height={76}
            className="h-16 w-auto object-contain"
            priority
          />
          <span className="[font-family:var(--font-merriweather)] text-4xl font-normal leading-none tracking-[0.02em] text-[#2f3b30]">
            NARRAVIT
          </span>
        </Link>
      </header>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-[5%] pb-20 pt-36 lg:py-24">
        <div className="w-full max-w-[32rem] border border-[#e0dcd5] bg-white p-7 sm:p-10 md:p-12">
          {children}
        </div>
      </div>

      <div className="relative hidden border-l border-[#e0dcd5] bg-[#f1ede7] lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(150,184,151,0.30),transparent_32%),radial-gradient(circle_at_80%_75%,rgba(208,188,166,0.38),transparent_35%)]" />
        <div className="relative mx-12 max-w-[39rem] border border-[#e0dcd5] bg-[#FAF8F6]/90 p-14 xl:p-16">
          <Image
            src="/logo.svg"
            alt=""
            width={176}
            height={176}
            className="mb-10 h-32 w-32 object-contain xl:h-40 xl:w-40"
          />
          <p className="mb-6 [font-family:var(--font-merriweather)] text-5xl leading-tight text-[#3E3831] xl:text-6xl">
            Dein Lebensbuch beginnt mit einem guten ersten Satz.
          </p>
          <p className="text-lg leading-8 text-[#535252]">
            Schreiben, erzählen und bewahren in einer ruhigen, warmen Oberfläche,
            die den Fokus auf deine Geschichte legt.
          </p>
        </div>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-14 items-center justify-center px-[5%] text-center md:justify-start">
        <p className="text-xs tracking-wide text-[#848484]">© {new Date().getFullYear()} NARRAVIT</p>
      </footer>
    </section>
  );
}
