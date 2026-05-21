"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { startCheckoutAction } from "@/app/checkout/actions";

// Client-Komponente für die zwei zahlungsbezogenen Stat-Karten der
// Projektübersicht (PROJ-6 Frontend):
//   1. "NARRAVIT-Projektzugang endet in …" + "Verlängern"-Button
//   2. "Telefonzeit übrig" + "Nachkaufen"-Button
//
// Die Stat-Werte werden vom Server (Server-Component) als Props
// übergeben. Die Buttons rufen `startCheckoutAction` auf. PROJ-6
// Frontend-Phase: die Action gibt nur `{ stubbed: true }` zurück
// und wir zeigen einen Hinweis "Stripe folgt in /backend".

type Props = {
  projectId: string;
  // ISO-String der Ablaufzeit, ODER null wenn noch nicht aktiviert.
  portalExpiresAt: string | null;
  // Sekunden — verfügbare Vapi-Sprechzeit (10h Inkl. + Top-Ups − Verbrauch).
  // null wenn Projekt noch keinen aktiven Zugang hat.
  vapiSecondsAvailable: number | null;
};

export function PaywallStats({
  projectId,
  portalExpiresAt,
  vapiSecondsAvailable,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <VapiStat
        projectId={projectId}
        secondsAvailable={vapiSecondsAvailable}
      />
      <PortalAccessStat
        projectId={projectId}
        expiresAt={portalExpiresAt}
      />
    </div>
  );
}

function VapiStat({
  projectId,
  secondsAvailable,
}: {
  projectId: string;
  secondsAvailable: number | null;
}) {
  return (
    <StatCard
      icon={<IconClock />}
      label="Telefonzeit übrig"
      value={
        secondsAvailable === null
          ? "—"
          : formatHours(secondsAvailable)
      }
      hint={
        secondsAvailable === null
          ? "Verfügbar nach Aktivierung des Telefon-Assistenten (PROJ-12)"
          : secondsAvailable < 60 * 60
            ? "Nur noch weniger als 60 Minuten — jetzt nachkaufen empfohlen."
            : "Genug Zeit für deine nächsten Erzähl-Sessions."
      }
      action={
        <CheckoutButton
          label="60 Minuten nachkaufen — 19 €"
          loadingLabel="Wird vorbereitet …"
          input={{ productType: "vapi", projectId }}
          disabled={secondsAvailable === null}
        />
      }
    />
  );
}

function PortalAccessStat({
  projectId,
  expiresAt,
}: {
  projectId: string;
  expiresAt: string | null;
}) {
  const daysLeft =
    expiresAt === null
      ? null
      : Math.max(
          0,
          Math.floor(
            (new Date(expiresAt).getTime() - Date.now()) / 86_400_000,
          ),
        );
  return (
    <StatCard
      icon={<IconCalendar />}
      label="NARRAVIT-Projektzugang endet in"
      value={daysLeft === null ? "—" : `${daysLeft} Tagen`}
      hint={
        daysLeft === null
          ? "Wird nach abgeschlossener Zahlung angezeigt (PROJ-6)"
          : daysLeft < 30
            ? "Verlängere jetzt, damit dein Zugang ohne Unterbrechung weiterläuft."
            : "Bezahlt bis " +
              new Date(expiresAt!).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }) + "."
      }
      action={
        <CheckoutButton
          label="Um 12 Monate verlängern — 99 €"
          loadingLabel="Wird vorbereitet …"
          input={{ productType: "renewal", projectId }}
          disabled={daysLeft === null}
        />
      }
    />
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 bg-white p-5 sm:p-8">
      <div className="flex flex-row items-center gap-2 sm:gap-3">
        <span className="shrink-0 [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-7 sm:[&>svg]:w-7">
          {icon}
        </span>
        <h3 className="[font-family:var(--font-pt-serif)] min-w-0 text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-9">
          {label}
        </h3>
      </div>
      <p className="text-3xl leading-9 text-[#3E3831] sm:text-4xl sm:leading-10">
        {value}
      </p>
      <p className="text-sm leading-6 text-[#848484] sm:text-base">{hint}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}

function CheckoutButton({
  label,
  loadingLabel,
  input,
  disabled,
}: {
  label: string;
  loadingLabel: string;
  input: Parameters<typeof startCheckoutAction>[0];
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await startCheckoutAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Stripe Hosted Checkout — Vollredirect.
      window.location.href = res.checkoutUrl;
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || disabled}
        className="inline-flex h-12 w-full min-w-0 cursor-pointer items-center justify-center gap-2 bg-[#0A0909]/5 px-4 text-base font-bold leading-6 text-[#534B42] transition-colors hover:bg-[#0A0909]/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-56 sm:text-lg"
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            {loadingLabel}
          </>
        ) : (
          label
        )}
      </button>
      {error && (
        <p
          className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function formatHours(seconds: number): string {
  if (seconds <= 0) return "0 Minuten";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Minuten`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function IconClock() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2} />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={5} width={18} height={16} rx={1} stroke="currentColor" strokeWidth={2} />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
