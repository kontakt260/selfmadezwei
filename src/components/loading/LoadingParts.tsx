import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// PROJ-30: Bausteine der Ladeansichten. Sie enthalten bewusst keine
// Projektdaten und keine Animation.

export const PORTAL_MAIN_CLASS =
  "[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-20 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pb-16 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12";

export function LoadingBlock({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("animate-none rounded-none bg-[#EFEAE3]", className)} />;
}

export function LoadingHint({ className }: { className?: string }) {
  return (
    <p role="status" className={cn("text-lg leading-7 text-[#4A453F]", className)}>
      Wird geladen …
    </p>
  );
}

export function LoadingPage({
  mainClassName = PORTAL_MAIN_CLASS,
  children,
}: {
  mainClassName?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className={mainClassName}>
        {children}
      </main>
    </>
  );
}
