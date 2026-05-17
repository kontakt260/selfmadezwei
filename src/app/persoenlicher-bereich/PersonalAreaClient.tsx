"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  updateNameAction,
  resetPasswordAction,
  deleteAccountAction,
  type UpdateNameState,
  type ResetPasswordState,
  type DeleteAccountState,
} from "./actions";

// ─── Design tokens (matching old app exactly) ────────────────────────────────

const narravitMuted = "#848484";
const narravitBorder = "#e0dcd5";
const narravitGreen = "#96B897";

// ─── Shared input class (mirrors old app accountInputRowClass) ───────────────

const inputClass = `[font-family:var(--font-lato)] box-border h-12 w-full shrink-0 border px-3 py-0 text-lg leading-[2.875rem] outline-none transition-colors sm:text-xl`;
const editableInputClass = `${inputClass} border-[${narravitBorder}] bg-white placeholder:text-[${narravitMuted}] focus:border-[${narravitGreen}]`;

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex w-full flex-col gap-5 bg-white px-5 py-6 sm:gap-6 sm:px-8 sm:py-8 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="[font-family:var(--font-pt-serif)] text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10"
    >
      {children}
    </h2>
  );
}

function FieldCard({
  label,
  hint,
  children,
  pinContentToBottom = false,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  pinContentToBottom?: boolean;
}) {
  return (
    <div
      className="flex h-full min-w-0 flex-col gap-1 bg-[#FAF8F6] p-4 sm:p-5"
    >
      <div className="shrink-0">
        <span className="[font-family:var(--font-lato)] text-base leading-6 text-[#848484]">
          {label}
        </span>
        <p className="[font-family:var(--font-lato)] mt-1 min-h-[3.75rem] text-sm leading-relaxed text-[#848484]/90 sm:min-h-[4.5rem] xl:min-h-[6rem]">
          {hint}
        </p>
      </div>
      <div
        className={
          pinContentToBottom
            ? "mt-auto flex w-full min-w-0 flex-col gap-2"
            : "flex w-full min-w-0 flex-col gap-2"
        }
      >
        {children}
      </div>
    </div>
  );
}

function SandButton({
  type = "button",
  disabled,
  children,
  onClick,
  className = "",
}: {
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`[font-family:var(--font-lato)] h-12 w-full shrink-0 bg-[#D0BCA6] px-6 text-lg font-bold leading-6 text-[#0a0909] transition-colors hover:bg-[#c0ad98] disabled:opacity-50 sm:w-auto sm:min-w-[186px] ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Account-Übersicht ───────────────────────────────────────────────────────

function AccountSection({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const [nameState, nameFormAction, namePending] = useActionState<UpdateNameState, FormData>(
    updateNameAction,
    {},
  );

  if (nameState.success) {
    toast.success("Name gespeichert.");
  }

  return (
    <SectionShell>
      <div className="flex flex-row flex-wrap items-center gap-3">
        <Image
          src="/nav/account.png"
          alt=""
          width={28}
          height={28}
          className="h-6 w-6 shrink-0 object-contain opacity-60 sm:h-7 sm:w-7"
          aria-hidden
          unoptimized
        />
        <SectionHeading>Account Übersicht</SectionHeading>
      </div>
      <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
        Diese Angaben nutzen wir für Anzeigen in der App, E-Mail-Versand und Ihre
        Mitgliedschaft. Passen Sie Ihren Namen bei Bedarf an.
      </p>

      <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
        {/* Name */}
        <FieldCard
          label="Name"
          hint="So erscheint Ihr Name z. B. in Begrüßungen, Projektlisten und von uns adressierten E-Mails."
          pinContentToBottom
        >
          <form action={nameFormAction} className="flex flex-col gap-2">
            <input
              id="account-name"
              name="name"
              type="text"
              autoComplete="name"
              defaultValue={fullName}
              className={`${editableInputClass} text-[#3E3831]`}
              aria-describedby="account-name-hint"
            />
            <p
              id="account-name-hint"
              className="min-h-[5rem] text-sm leading-6 text-[#848484] sm:min-h-[5.5rem] xl:min-h-[6.5rem]"
            >
              Tipp: Verwenden Sie den Namen, mit dem Sie angesprochen werden
              möchten.
            </p>
            {nameState.error && (
              <p className="text-base text-destructive">{nameState.error}</p>
            )}
            <SandButton type="submit" disabled={namePending}>
              {namePending ? "Wird gespeichert …" : "Name speichern"}
            </SandButton>
          </form>
        </FieldCard>

        {/* E-Mail (read-only) */}
        <FieldCard
          label="E-Mail"
          hint="Um Ihre E-Mail-Adresse zu ändern, wenden Sie sich bitte an den Support."
        >
          <input
            id="account-email"
            name="email"
            type="email"
            readOnly
            tabIndex={-1}
            value={email}
            className={`${editableInputClass} cursor-default select-none text-[#848484]`}
          />
          <p className="min-h-[5rem] text-sm leading-6 text-[#848484] sm:min-h-[5.5rem] xl:min-h-[6.5rem]">
            Ihre Anmelde-E-Mail — für Änderungen wenden Sie sich an den Support.
          </p>
        </FieldCard>

      </div>
    </SectionShell>
  );
}

// ─── Rechnungen (Placeholder) ────────────────────────────────────────────────

function InvoiceSection() {
  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Rechnungen</SectionHeading>
        <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
          Hier finden Sie alle bisherigen Belege und Zahlungsnachweise — ideal
          für die Buchhaltung oder wenn Sie eine Übersicht über Ihre Ausgaben bei
          uns brauchen.
        </p>
      </div>

      {/* Placeholder table */}
      <div className="border border-[#e0dcd5]">
        <div className="grid grid-cols-4 border-b border-[#e0dcd5] bg-[#FAF8F6] px-4 py-2">
          {["Datum", "Betrag", "Typ", "Rechnung"].map((h) => (
            <span key={h} className="text-sm font-bold uppercase tracking-wide text-[#848484]">
              {h}
            </span>
          ))}
        </div>
        <div className="px-4 py-6 text-center text-base text-[#848484] sm:text-lg">
          Noch keine Rechnungen vorhanden.
        </div>
      </div>
    </SectionShell>
  );
}

// ─── Sicherheit ──────────────────────────────────────────────────────────────

function SecuritySection({ authProvider }: { authProvider: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    {},
  );

  const isEmailProvider = authProvider === "email";
  const providerLabel = authProvider === "google" ? "Google" : authProvider === "apple" ? "Apple" : authProvider;

  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Sicherheit</SectionHeading>
        {isEmailProvider ? (
          <>
            <p className="[font-family:var(--font-lato)] max-w-4xl text-lg font-semibold leading-8 text-[#3E3831] sm:text-xl sm:leading-9">
              Mit dem Klick auf „Passwort zurücksetzen" erhalten Sie eine E-Mail
              von uns mit einem sicheren Link, über den Sie ein neues Passwort
              vergeben können.
            </p>
            <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
              Wir empfehlen ein starkes, einzigartiges Passwort und regelmäßige
              Aktualisierung, besonders wenn Sie sich auf einem gemeinsam
              genutzten Gerät angemeldet haben.
            </p>
          </>
        ) : (
          <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
            Du meldest dich über {providerLabel} an — die Passwort-Verwaltung
            erfolgt dort.
          </p>
        )}
      </div>

      {isEmailProvider && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 max-w-xl">
            {state.success ? (
              <p className="text-base leading-7 text-[#96B897]">
                Wir haben dir einen Link zum Zurücksetzen geschickt. Bitte prüfe
                auch deinen Spam-Ordner.
              </p>
            ) : (
              <p className="text-base leading-7 text-[#848484]">
                Sie bleiben während des Vorgangs angemeldet; nach erfolgreicher
                Änderung sollten Sie sich neu anmelden.
              </p>
            )}
            {state.error && (
              <p className="text-base text-destructive">{state.error}</p>
            )}
          </div>
          <form action={formAction}>
            <SandButton type="submit" disabled={pending || !!state.success}>
              {pending ? "Wird gesendet …" : "Passwort zurücksetzen"}
            </SandButton>
          </form>
        </div>
      )}
    </SectionShell>
  );
}

// ─── Account löschen ─────────────────────────────────────────────────────────

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );

  const isConfirmed = confirmation === "LÖSCHEN";
  const isSoleOwner = state.error === "sole_owner";

  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Account löschen</SectionHeading>
        <p className="[font-family:var(--font-lato)] max-w-3xl text-lg font-semibold leading-8 text-[#D00018] sm:text-xl sm:leading-9">
          Achtung: Das Löschen ist unwiderruflich — Sie verlieren den Zugang zu
          Ihrem Account und zu allen zugehörigen Inhalten.
        </p>
        <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
          Exportieren Sie vorher ggf. wichtige Texte oder Bilder. Nach Abschluss
          können weder Projekte noch Rechnungen wiederhergestellt werden.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-base leading-7 text-[#848484] sm:text-lg sm:leading-8">
          Nutzen Sie diese Option nur, wenn Sie sicher sind. Bei Unsicherheiten
          wenden Sie sich vorher an den Support.
        </p>

        <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmation(""); }}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="[font-family:var(--font-lato)] h-12 w-full shrink-0 whitespace-nowrap bg-[#53444B] px-4 text-center text-lg font-bold leading-6 text-white transition-colors hover:bg-[#45383e] sm:w-auto sm:px-6"
            >
              Account löschen
            </button>
          </AlertDialogTrigger>

          <AlertDialogContent className="max-w-[calc(100vw-2rem)] p-5 sm:max-w-2xl sm:p-8">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
                Account wirklich löschen?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-4 text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
                  <p>
                    Diese Aktion ist <strong>unwiderruflich</strong>. Alle Ihre
                    Projekte, Kapitel und Daten werden dauerhaft entfernt.
                  </p>

                  {isSoleOwner && (
                    <div className="border border-destructive/30 bg-destructive/5 p-4 text-base leading-7 text-destructive">
                      Du bist auf {state.soleOwnerCount}{" "}
                      {state.soleOwnerCount === 1 ? "Projekt" : "Projekten"} der
                      einzige Projektleiter. Übertrage die Projektleiterschaft oder
                      lösche die Projekte zuerst.
                    </div>
                  )}

                  {state.error && !isSoleOwner && (
                    <p className="text-base text-destructive">{state.error}</p>
                  )}

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="delete-confirm" className="text-sm font-bold text-[#3E3831] sm:text-base">
                      Tippe <strong>LÖSCHEN</strong> zur Bestätigung:
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      placeholder="LÖSCHEN"
                      className="h-12 text-base sm:text-lg"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-col gap-3 sm:flex-row">
              <AlertDialogCancel className="h-12 text-base sm:text-lg">Abbrechen</AlertDialogCancel>
              <form action={formAction}>
                <button
                  type="submit"
                  disabled={!isConfirmed || pending}
                  className="[font-family:var(--font-lato)] h-12 w-full bg-[#53444B] px-5 text-base font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:text-lg"
                >
                  {pending ? "Wird gelöscht …" : "Account endgültig löschen"}
                </button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SectionShell>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface PersonalAreaProps {
  fullName: string;
  email: string;
  authProvider: string;
}

export function PersonalAreaClient({
  fullName,
  email,
  authProvider,
}: PersonalAreaProps) {
  return (
    <>
      <Navbar />
      <main
        className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-16 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12"
      >
        <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">
          {/* Banner */}
          <div className="relative h-[min(31.5vh,285px)] w-full min-h-[105px] overflow-hidden sm:min-h-[135px]">
            <Image
              src="/images/persoenlicher-bereich-banner.png"
              alt="Person mit Laptop auf einem Ledersofa — stimmungsvolles Bannerbild."
              fill
              className="object-cover blur-[2px]"
              sizes="(max-width: 768px) 100vw, 1213px"
              priority
            />
          </div>

          {/* Header */}
          <header className="flex w-full flex-col items-center gap-2 text-center">
            <h1 className="[font-family:var(--font-merriweather)] w-full text-3xl font-medium leading-10 text-[#3E3831] sm:text-4xl sm:leading-[1.2] md:text-5xl">
              Persönlicher Bereich
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-[#535252] sm:text-xl sm:leading-9">
              Hier verwalten Sie die wichtigsten Angaben zu Ihrem NARRAVIT-Konto,
              Ihre Abrechnung und sicherheitsrelevante Aktionen — alles an einem
              Ort, übersichtlich gegliedert.
            </p>
          </header>

          {/* Sections */}
          <div className="flex flex-col gap-6 sm:gap-8">
            <AccountSection fullName={fullName} email={email} />
            <InvoiceSection />
            <SecuritySection authProvider={authProvider} />
            <DeleteAccountSection />
          </div>
        </div>
      </main>
    </>
  );
}
