"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { PORTAL_MAIN_CLASS } from "@/components/loading/LoadingParts";
import { Button } from "@/components/ui/button";

// PROJ-30: Gemeinsame Fehleransicht der Seiten nach der Anmeldung. Technische
// Details bleiben im Server-Log.
export function PageError({ retry }: { retry: () => void }) {
  const onStartPage = usePathname() === "/";
  return (
    <>
      <Navbar />
      <main className={PORTAL_MAIN_CLASS}>
        <div
          role="alert"
          className="mx-auto flex w-full max-w-2xl flex-col items-start gap-5 border border-[#E0DCD5] bg-white p-6 sm:p-10"
        >
          <h1 className="text-[1.75rem] leading-tight text-[#3E3831] sm:text-[2rem]">
            Das hat gerade nicht geklappt
          </h1>
          <p className="text-lg leading-8 text-[#4A453F]">
            Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button type="button" onClick={retry} className="h-12 px-6 text-lg font-bold">
              Erneut versuchen
            </Button>
            {onStartPage ? null : (
              <Button asChild variant="outline" className="h-12 px-6 text-lg font-bold">
                <Link href="/">Zur Startseite</Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
