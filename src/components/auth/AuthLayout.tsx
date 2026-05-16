import Link from "next/link";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <section className="relative grid min-h-screen grid-cols-1 justify-center overflow-auto lg:grid-cols-2">
      <header className="absolute left-0 right-0 top-0 z-10 flex h-16 items-center justify-center px-[5%] md:h-18 lg:justify-start">
        <Link href="/" className="font-medium tracking-tight">
          NARRAVIT
        </Link>
      </header>

      <div className="relative mx-[5vw] flex items-center justify-center pb-16 pt-20 md:pb-20 md:pt-24 lg:py-20">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>

      {/* TODO: NARRAVIT Hero-Image hier ersetzen (z. B. gedrucktes Lebensbuch, warme Familien-Szene). */}
      <div
        className="hidden bg-neutral-200 lg:flex lg:items-center lg:justify-center"
        aria-hidden="true"
      >
        <p className="px-12 text-center text-sm text-muted-foreground">
          Platzhalter — hier kommt das NARRAVIT-Hero-Bild.
        </p>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 flex h-16 items-center justify-center px-[5%] md:h-18 md:justify-start">
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} NARRAVIT</p>
      </footer>
    </section>
  );
}
