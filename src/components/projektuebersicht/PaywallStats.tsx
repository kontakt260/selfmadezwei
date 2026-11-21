"use client";

import { CheckoutButton } from "./CheckoutButton";

// Client-Komponente für die zahlungsbezogene Stat-Karte der
// Projektübersicht (PROJ-6 Frontend):
//   "NARRAVIT-Projektzugang endet in …" + "Verlängern"-Button
// Die frühere Karte "Telefonzeit übrig" ist mit dem Rückbau des
// Erzählzeit-Kontingents entfallen (2026-10-13).
//
// Die Stat-Werte werden vom Server (Server-Component) als Props
// übergeben. Die Buttons rufen `startCheckoutAction` auf. PROJ-6
// Frontend-Phase: die Action gibt nur `{ stubbed: true }` zurück
// und wir zeigen einen Hinweis "Stripe folgt in /backend".

type Props = {
  projectId: string;
  // ISO-String der Ablaufzeit, ODER null wenn noch nicht aktiviert.
  portalExpiresAt: string | null;
  // Verbleibende volle Tage, serverseitig berechnet (`daysUntil`);
  // null, wenn noch nicht aktiviert.
  daysLeft: number | null;
};

export function PaywallStats({ projectId, portalExpiresAt, daysLeft }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6">
      <PortalAccessStat
        projectId={projectId}
        expiresAt={portalExpiresAt}
        daysLeft={daysLeft}
      />
    </div>
  );
}

function PortalAccessStat({
  projectId,
  expiresAt,
  daysLeft,
}: {
  projectId: string;
  expiresAt: string | null;
  daysLeft: number | null;
}) {
  return (
    <StatCard
      icon={<IconCalendar />}
      label="NARRAVIT-Projektzugang endet in"
      value={daysLeft === null ? "—" : `${daysLeft} Tagen`}
      hint={
        daysLeft === null || expiresAt === null
          ? "Wird nach abgeschlossener Zahlung angezeigt (PROJ-6)"
          : daysLeft < 30
            ? "Verlängern Sie jetzt, damit Ihr Zugang ohne Unterbrechung weiterläuft."
            : "Bezahlt bis " +
              new Date(expiresAt).toLocaleDateString("de-DE", {
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

function IconCalendar() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={5} width={18} height={16} rx={1} stroke="currentColor" strokeWidth={2} />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
