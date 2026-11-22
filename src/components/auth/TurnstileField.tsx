"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// PROJ-17 — Sicherheitsprüfung (Cloudflare Turnstile) in den Auth-Formularen.
//
// Läuft im Normalfall unsichtbar. Das Widget legt sein Token in ein
// verstecktes Feld `cf-turnstile-response` im umgebenden Formular, die Server
// Action reicht es an Supabase weiter. Ein Token gilt genau einmal: Nach jeder
// Antwort des Servers (`resetSignal`) holen wir deshalb ein neues.
//
// Ohne `NEXT_PUBLIC_TURNSTILE_SITE_KEY` rendert die Komponente nichts, das
// Formular bleibt benutzbar (Reihenfolge der Umstellung: siehe PROJ-17).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

/** Ab dieser Wartezeit erklären wir, warum der Button noch gesperrt ist. */
const SLOW_HINT_MS = 2000;

export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

type Status = "pending" | "ready" | "failed";

type Props = {
  /** Meldet, ob ein gültiges Token vorliegt und das Formular absendbar ist. */
  onReadyChange: (ready: boolean) => void;
  /** Ändert sich nach jeder Server-Antwort, z. B. der Action-State. */
  resetSignal?: unknown;
};

function SlowCheckHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SLOW_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <p role="status" className="text-sm text-[#535252]">
      Sicherheitsprüfung läuft …
    </p>
  );
}

export function TurnstileField({ onReadyChange, resetSignal }: Props) {
  const widget = useRef<TurnstileInstance | undefined>(undefined);
  const lastResetSignal = useRef(resetSignal);
  const [status, setStatus] = useState<Status>("pending");
  const [seenSignal, setSeenSignal] = useState(resetSignal);
  const [interactive, setInteractive] = useState(false);

  // Neue Server-Antwort: Das Token ist verbraucht.
  if (seenSignal !== resetSignal) {
    setSeenSignal(resetSignal);
    setStatus("pending");
  }

  useEffect(() => {
    if (lastResetSignal.current === resetSignal) return;
    lastResetSignal.current = resetSignal;
    onReadyChange(false);
    widget.current?.reset();
  }, [resetSignal, onReadyChange]);

  const update = (next: Status) => {
    setStatus(next);
    onReadyChange(next === "ready");
  };

  if (!TURNSTILE_ENABLED) return null;

  return (
    <>
      {/* Ohne Rückfrage nimmt das Widget keinen Platz im Formular ein. */}
      <div className={interactive ? "w-full" : "absolute h-0 w-0 overflow-hidden"}>
        <Turnstile
          ref={widget}
          siteKey={SITE_KEY}
          options={{
            appearance: "interaction-only",
            language: "de",
            size: "flexible",
            refreshExpired: "auto",
          }}
          onSuccess={() => update("ready")}
          onExpire={() => update("pending")}
          onError={() => update("failed")}
          onBeforeInteractive={() => setInteractive(true)}
          onAfterInteractive={() => setInteractive(false)}
        />
      </div>

      {/* Bei einer sichtbaren Rückfrage ist die Person selbst am Zug. */}
      {status === "pending" && !interactive && <SlowCheckHint />}

      {status === "failed" && (
        <div role="alert" className="grid gap-2 text-sm">
          <p className="text-destructive">
            Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfen Sie Ihre
            Internetverbindung und versuchen Sie es erneut.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => {
              update("pending");
              widget.current?.reset();
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      )}
    </>
  );
}
