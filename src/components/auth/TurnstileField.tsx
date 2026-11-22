"use client";

import {
  DEFAULT_SCRIPT_ID,
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
/** Kommt bis dahin kein Ergebnis, ist das Skript vermutlich blockiert. */
const LOAD_TIMEOUT_MS = 10_000;
/**
 * Das breite Widget braucht mindestens 300 px. Darunter passt es in den
 * Formularen nicht mehr, auf Handys nehmen wir deshalb die kompakte Größe.
 */
const COMPACT_BELOW_PX = 450;

export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

type Status = "pending" | "ready" | "failed" | "unsupported";

type Props = {
  /** Meldet, ob ein gültiges Token vorliegt und das Formular absendbar ist. */
  onReadyChange: (ready: boolean) => void;
  /** Ändert sich nach jeder Server-Antwort, z. B. der Action-State. */
  resetSignal?: unknown;
};

const neverChanges = () => () => {};
const widgetSizeOnClient = () =>
  window.innerWidth < COMPACT_BELOW_PX ? ("compact" as const) : ("flexible" as const);
const noWidgetOnServer = () => null;

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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const size = useSyncExternalStore(neverChanges, widgetSizeOnClient, noWidgetOnServer);

  // Neue Server-Antwort: Das Token ist verbraucht.
  if (seenSignal !== resetSignal) {
    setSeenSignal(resetSignal);
    if (status !== "unsupported") setStatus("pending");
  }

  useEffect(() => {
    if (lastResetSignal.current === resetSignal) return;
    lastResetSignal.current = resetSignal;
    onReadyChange(false);
    widget.current?.reset();
  }, [resetSignal, onReadyChange]);

  // Ein blockiertes Skript meldet sich nie. Ohne diese Grenze bliebe das
  // Formular ohne Erklärung gesperrt. Kommt das Token später doch, verschwindet
  // der Hinweis wieder.
  useEffect(() => {
    if (!TURNSTILE_ENABLED || status !== "pending" || interactive) return;
    const timer = setTimeout(() => {
      setStatus("failed");
      onReadyChange(false);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, interactive, loadAttempt, resetSignal, onReadyChange]);

  const update = (next: Status) => {
    setStatus(next);
    onReadyChange(next === "ready");
  };

  const retry = () => {
    update("pending");
    setInteractive(false);
    if (window.turnstile) {
      widget.current?.reset();
      return;
    }
    // Das Skript kam nie an: Das alte Tag entfernen, damit es neu geladen wird.
    document.getElementById(DEFAULT_SCRIPT_ID)?.remove();
    setLoadAttempt((attempt) => attempt + 1);
  };

  if (!TURNSTILE_ENABLED) return null;

  const visibleLayout = size === "compact" ? "flex w-full justify-center" : "w-full";

  return (
    <>
      {/* Ohne Rückfrage nimmt das Widget keinen Platz im Formular ein. */}
      <div className={interactive ? visibleLayout : "absolute h-0 w-0 overflow-hidden"}>
        {size && (
          <Turnstile
            key={loadAttempt}
            ref={widget}
            siteKey={SITE_KEY}
            options={{
              appearance: "interaction-only",
              language: "de",
              size,
              refreshExpired: "auto",
            }}
            onSuccess={() => update("ready")}
            onExpire={() => update("pending")}
            onError={() => update("failed")}
            onUnsupported={() => update("unsupported")}
            onBeforeInteractive={() => setInteractive(true)}
            onAfterInteractive={() => setInteractive(false)}
          />
        )}
      </div>

      {/* Bei einer sichtbaren Rückfrage ist die Person selbst am Zug. */}
      {status === "pending" && !interactive && <SlowCheckHint />}

      {status === "failed" && (
        <div role="alert" className="grid gap-2 text-sm">
          <p className="text-destructive">
            Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfen Sie Ihre
            Internetverbindung und versuchen Sie es erneut.
          </p>
          <Button type="button" variant="outline" className="h-12" onClick={retry}>
            Erneut versuchen
          </Button>
        </div>
      )}

      {status === "unsupported" && (
        <p role="alert" className="text-sm text-destructive">
          Ihr Browser unterstützt die Sicherheitsprüfung nicht. Bitte aktualisieren Sie
          ihn oder nutzen Sie einen anderen Browser.
        </p>
      )}
    </>
  );
}
