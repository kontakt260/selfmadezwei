import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Seite nicht gefunden — NARRAVIT",
};

// PROJ-30: Derselbe Text für nicht vorhandene und fremde Inhalte, damit niemand
// erfährt, ob es ein Projekt gibt.
export default function NotFound() {
  return (
    <main className="[font-family:var(--font-lato)] flex min-h-[100dvh] w-full flex-1 items-center justify-center bg-[#FAF8F6] px-4 py-12">
      <div className="flex w-full max-w-2xl flex-col items-start gap-5 border border-[#E0DCD5] bg-white p-6 sm:p-10">
        <h1 className="text-[1.75rem] leading-tight text-[#3E3831] sm:text-[2rem]">
          Diese Seite gibt es nicht
        </h1>
        <p className="text-lg leading-8 text-[#4A453F]">
          Die Adresse stimmt nicht, oder Sie haben keinen Zugriff auf diesen Inhalt.
        </p>
        <Button asChild className="h-12 w-full px-6 text-lg font-bold sm:w-auto">
          <Link href="/">Zur Startseite</Link>
        </Button>
      </div>
    </main>
  );
}
