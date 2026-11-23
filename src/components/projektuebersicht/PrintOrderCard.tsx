import { Button } from "@/components/ui/button";

// PROJ-22: Platzhalter für den Druckauftrag bis PROJ-16. Die Karte zeigt nur
// vorhandene Daten, speichert nichts und bietet keinen Download. Sie liegt
// bewusst außerhalb von ReadOnlyScope, weil der Druckauftrag laut PROJ-28 auch
// in den 90 Tagen nach dem Ablauf möglich bleibt.

type Props = {
  title: string;
  chapterCount: number;
  pageCount: number;
  openChapterCount: number;
  hasCover: boolean;
};

const HINT_ID = "print-order-hint";

function pagesLabel(pageCount: number): string {
  return pageCount === 1 ? "1 Seite" : `${pageCount} Seiten`;
}

function contentStatus(chapterCount: number, openChapterCount: number): {
  text: string;
  done: boolean;
} {
  if (chapterCount === 0) return { text: "Noch keine Kapitel", done: false };
  if (openChapterCount === 0) return { text: "Alle Kapitel sind geschrieben", done: true };
  return {
    text:
      openChapterCount === 1
        ? "1 Kapitel ist noch offen"
        : `${openChapterCount} Kapitel sind noch offen`,
    done: false,
  };
}

function PrintStep({
  title,
  detail,
  status,
  done,
}: {
  title: string;
  detail: string;
  status: string;
  done: boolean;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 bg-[#FAF8F6] p-5">
      <h3 className="text-2xl leading-snug text-[#3E3831]">{title}</h3>
      <p className="text-lg leading-normal text-[#4A453F] [overflow-wrap:anywhere]">{detail}</p>
      <p className={`text-[1.0625rem] font-bold leading-normal ${done ? "text-[#2B452F]" : "text-[#8A3B12]"}`}>
        {status}
      </p>
    </li>
  );
}

export function PrintOrderCard({
  title,
  chapterCount,
  pageCount,
  openChapterCount,
  hasCover,
}: Props) {
  const content = contentStatus(chapterCount, openChapterCount);

  return (
    <section className="flex flex-col gap-5 border border-[#E0DCD5] bg-white p-5 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-[1.75rem] leading-tight text-[#3E3831] sm:text-[2.125rem]">
          Buch in den Druck geben
        </h2>
        <p className="max-w-[820px] text-lg leading-normal text-[#4A453F] sm:text-[1.1875rem]">
          Wenn Ihr Buch fertig ist, geben Sie hier den Druckauftrag. Ihr erstes gedrucktes Buch
          ist bereits bezahlt.
        </p>
      </div>

      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-3.5">
        <PrintStep
          title="1. Inhalt"
          detail={
            chapterCount === 0
              ? "Ihr Buch hat noch keinen Inhalt."
              : `${chapterCount} Kapitel, ${pagesLabel(pageCount)}`
          }
          status={content.text}
          done={content.done}
        />
        <PrintStep
          title="2. Cover"
          detail={title}
          status={hasCover ? "Fertig gestaltet" : "Noch nicht gestaltet"}
          done={hasCover}
        />
        <PrintStep
          title="3. Lieferadresse"
          detail="Wohin soll das Buch gehen?"
          status="Noch nicht angegeben"
          done={false}
        />
      </ol>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby={HINT_ID}
          className="h-[3.25rem] w-full border-[#D5D0C9] bg-[#F8F7F5] px-5 text-lg font-bold text-[#6B655E] disabled:opacity-100 sm:w-auto"
        >
          Lieferadresse eingeben
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby={HINT_ID}
          className="h-[3.25rem] w-full border-[#D5D0C9] bg-[#F8F7F5] px-5 text-lg font-bold text-[#6B655E] disabled:opacity-100 sm:w-auto"
        >
          Druckauftrag geben
        </Button>
        <p id={HINT_ID} className="text-[1.0625rem] leading-normal text-[#5F5A54]">
          Der Druckauftrag wird gerade vorbereitet.
        </p>
      </div>
    </section>
  );
}
