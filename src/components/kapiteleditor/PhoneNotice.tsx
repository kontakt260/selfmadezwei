import Link from "next/link";
import { Smartphone, ArrowLeft } from "lucide-react";

export function PhoneNotice({ projectId }: { projectId: string }) {
  return (
    <main className="[font-family:var(--font-lato)] flex min-h-[100dvh] items-center justify-center bg-[#FAF8F6] px-6 py-16 md:hidden">
      <div className="flex w-full max-w-md flex-col items-center gap-6 border border-[#e0dcd5] bg-white p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F7F3] text-[#96B897]">
          <Smartphone className="h-7 w-7" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="[font-family:var(--font-merriweather)] text-2xl font-medium leading-8 text-[#3E3831]">
            Editor auf dem Smartphone nicht verfügbar
          </h1>
          <p className="text-base leading-7 text-[#535252]">
            Der Kapitel-Editor ist auf dem Smartphone nicht verfügbar — öffne NARRAVIT auf einem
            Tablet oder Desktop-Computer.
          </p>
        </div>
        <Link
          href={`/projektuebersicht/${projectId}`}
          className="inline-flex h-12 items-center justify-center gap-2 bg-[#D0BCA6] px-6 text-base font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Projektübersicht
        </Link>
      </div>
    </main>
  );
}
