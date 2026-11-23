import { Fragment, type ReactNode } from "react";
import { BackdropScreen } from "@/components/BackdropScreen";

// Rahmen der Einladungs-Seite: weichgezeichnetes Foto, Karte mit Logo.

export function InvitationCard({ children }: { children: ReactNode }) {
  return <BackdropScreen backdrop="einladung">{children}</BackdropScreen>;
}

export function InvitationHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-center text-2xl text-[#3E3831] sm:text-3xl">
      {children}
    </h1>
  );
}

export function InvitationPreview({
  title,
  role,
  inviter,
  email,
}: {
  title: string;
  /** Bei Geschenken bewusst nicht angezeigt. */
  role?: string;
  inviter?: string;
  email: string;
}) {
  const rows = [
    role ? { label: "Rolle", value: role } : null,
    inviter ? { label: "Eingeladen von", value: inviter } : null,
    { label: "Für", value: email },
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <div className="flex flex-col gap-2">
      <p className="[font-family:var(--font-pt-serif)] text-xl text-[#3E3831] sm:text-2xl">
        {title}
      </p>
      {/* Linke Spalte so breit wie die längste Bezeichnung: Sie bricht nie um,
          lange Werte bleiben in der rechten Spalte. */}
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2 text-base leading-7 text-[#535252] sm:gap-x-8 sm:text-lg">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="whitespace-nowrap font-semibold text-[#3E3831]">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
