"use client";

import { useRef } from "react";
import { Loader2, Type } from "lucide-react";
import { BOOK_FONTS, bookFont, isBookFontId, type BookFontId } from "@/lib/book-fonts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bookFontVariables } from "./bookFontFaces";

// PROJ-32: Jede Schrift steht im Auswahlfeld in sich selbst (Spec AC-2). Feste
// Klassen, damit Tailwind sie findet.
const FONT_CLASS: Record<BookFontId, string> = {
  "pt-serif": "[font-family:var(--font-pt-serif)]",
  garamond: "[font-family:var(--font-book-garamond)]",
  baskerville: "[font-family:var(--font-book-baskerville)]",
  pagella: "[font-family:var(--font-book-pagella)]",
  heros: "[font-family:var(--font-book-heros)]",
  atkinson: "[font-family:var(--font-book-atkinson)]",
};

const HINT = "Buchschrift: gilt für das ganze Buch, für alle Kapitel und den Druck";
const READ_ONLY_REASON =
  "Ihr Projektzugang ist abgelaufen. Die Schrift können Sie erst nach einer Verlängerung ändern.";

export function BookFontSelect({
  value,
  onRequestChange,
  onClosedWithoutChange,
  disabled = false,
  readOnly = false,
  busy = false,
}: {
  /** Schrift des Buches, wie sie gespeichert ist. */
  value: BookFontId;
  /** Eine andere Schrift wurde gewählt. Die Rückfrage stellt der Editor. */
  onRequestChange: (next: BookFontId) => void;
  /** Menü ohne Wechsel geschlossen: Fokus zurück in den Text. */
  onClosedWithoutChange: () => void;
  disabled?: boolean;
  /** Lesemodus (PROJ-28): Grund im Tooltip. */
  readOnly?: boolean;
  /** Ein Wechsel wird gerade gespeichert und geladen. */
  busy?: boolean;
}) {
  const changed = useRef(false);
  const label = readOnly ? `${HINT}. ${READ_ONLY_REASON}` : HINT;
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (!isBookFontId(next) || next === value) return;
        changed.current = true;
        onRequestChange(next);
      }}
      onOpenChange={(open) => {
        if (open) changed.current = false;
      }}
      disabled={disabled || readOnly || busy}
    >
      <SelectTrigger
        // Breit genug für den längsten Namen in seiner eigenen Schrift (Baskerville).
        className="h-8 w-[160px] gap-1.5 border-transparent text-sm hover:bg-accent/40"
        // Der Fokus bleibt im Text, bis das Menü wirklich aufgeht.
        onMouseDown={(event) => event.preventDefault()}
        aria-label={label}
        aria-busy={busy || undefined}
        title={readOnly ? READ_ONLY_REASON : HINT}
        data-testid="book-font-select"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#848484]" aria-hidden />
        ) : (
          <Type className="h-4 w-4 shrink-0 text-[#848484]" aria-hidden />
        )}
        <SelectValue>
          <span className={FONT_CLASS[value]}>{bookFont(value).label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        // Das Menü hängt am Seitenende (Portal) und braucht die Schriften selbst.
        className={bookFontVariables}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!changed.current) onClosedWithoutChange();
        }}
      >
        {BOOK_FONTS.map((font) => (
          <SelectItem key={font.id} value={font.id} className="py-2">
            <span className={`${FONT_CLASS[font.id]} text-base`}>{font.label}</span>
            <span className="ml-2 text-xs text-[#848484]">{font.hint}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
