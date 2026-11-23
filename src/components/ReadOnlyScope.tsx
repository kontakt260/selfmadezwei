import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// PROJ-28 — sperrt alle Buttons und Felder eines Bereichs auf einmal.
//
// Ein deaktiviertes <fieldset> deaktiviert im Browser jedes Bedienelement
// darin. So kann eine neue Funktion im Lesemodus nicht versehentlich aktiv
// bleiben. `contents` lässt das Layout unberührt. Links bleiben klickbar.
// Der eigentliche Schutz liegt auf dem Server und in der Datenbank.

export function ReadOnlyScope({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={readOnly}
      className={cn(
        "contents",
        readOnly &&
          "[&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-40 [&_input:disabled]:cursor-not-allowed [&_input:disabled]:opacity-60",
      )}
    >
      {children}
    </fieldset>
  );
}
