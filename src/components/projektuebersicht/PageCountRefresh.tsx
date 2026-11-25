"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { TypesetResult } from "@/components/kapiteleditor/typeset/BackgroundTypesetter";

// PROJ-32 Schritt 3 (AC-13): Solange Kapitel eine Seitenzahl aus einer anderen
// Schrift haben, steht hier ein Hinweis, und der Neusatz läuft im Hintergrund.
// Er wird erst dann geladen, sonst lädt die Übersicht keine Buchschriften (AC-20).
const BackgroundTypesetter = dynamic(
  () => import("@/components/kapiteleditor/typeset/BackgroundTypesetter"),
  { ssr: false },
);

export function PageCountRefresh({
  projectId,
  staleCount,
  readOnly,
}: {
  projectId: string;
  /** Kapitel mit veralteter Seitenzahl, vom Server gezählt. */
  staleCount: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<TypesetResult | null>(null);
  // Nach dem Neuladen der Daten zählt der Server neu. Bleiben Kapitel übrig
  // (etwa weil inzwischen erneut gewechselt wurde), startet ein neuer Durchgang.
  const [runFor, setRunFor] = useState(staleCount);
  if (runFor !== staleCount) {
    setRunFor(staleCount);
    setResult(null);
    setProgress(null);
  }

  // Im Lesemodus darf nichts gespeichert werden, die Zahlen bleiben, wie sie sind.
  if (staleCount === 0 || readOnly) return null;

  const failed = result === "failed";
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-base leading-relaxed text-[#5F5A54]"
        data-testid="page-count-refresh"
      >
        {failed ? (
          "Die Seitenzahlen konnten gerade nicht aktualisiert werden. Bitte öffnen Sie diese Seite später erneut."
        ) : (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            {progress && progress.total > 0
              ? `Seitenzahlen werden aktualisiert (${progress.done} von ${progress.total} Kapiteln) …`
              : "Seitenzahlen werden aktualisiert …"}
          </>
        )}
      </p>
      {result === null && (
        <BackgroundTypesetter
          key={runFor}
          projectId={projectId}
          onProgress={(done, total) => setProgress({ done, total })}
          onFinished={(next) => {
            setResult(next);
            if (next === "done") router.refresh();
          }}
        />
      )}
    </>
  );
}
