import "server-only";
import { after } from "next/server";

// PROJ-11 — Mail-Versand nach der Antwort, aber an die Laufzeit gebunden.
//
// Ein bloßes `void sendXxx()` startet den Versand, ohne dass die Plattform
// davon weiß: Vercel darf die Funktion nach dem Senden der Antwort
// anhalten, der Versand bricht dann mittendrin ab. `after()` meldet die
// Arbeit an (auf Vercel per `waitUntil`), die Antwort geht trotzdem sofort
// raus.
//
// Außerhalb eines Requests (Unit-Tests) wirft `after()`; dort starten wir
// den Versand direkt.

export function sendInBackground(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(
        `[email/${label}] background send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
