import { cn } from "@/lib/utils";

// PROJ-22: Der Markenname steht in Überschriften und Schriftzügen immer in
// Merriweather. Merriweather läuft breiter als PT Serif, deshalb ist das Wort
// etwas kleiner gesetzt und wirkt neben der Überschrift gleich groß.

export function BrandName({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "[font-family:var(--font-merriweather)] text-[0.9em] font-normal tracking-normal",
        className,
      )}
    >
      NARRAVIT
    </span>
  );
}
