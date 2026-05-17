"use client";

import { useActionState, useTransition, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  changeEmailAction,
  resetPasswordAction,
  deleteAccountAction,
  type UpdateNameState,
  type ChangeEmailState,
  type ResetPasswordState,
  type DeleteAccountState,
} from "./actions";

// ─── Design tokens (matching old app exactly) ────────────────────────────────

const narravitPage = "#FAF8F6";
const narravitText = "#3E3831";
const narravitMuted = "#848484";
const narravitBorder = "#e0dcd5";
const narravitGreen = "#96B897";
const narravitSand = "#D0BCA6";
const narravitSandHover = "#c0ad98";
const narravitDarkBtn = "#53444B";
const narravitDarkBtnHover = "#45383e";

// ─── Shared input class (mirrors old app accountInputRowClass) ───────────────

const inputClass = `[font-family:var(--font-lato)] box-border h-12 w-full shrink-0 border px-3 py-0 text-lg leading-[2.875rem] outline-none transition-colors`;
const editableInputClass = `${inputClass} border-[${narravitBorder}] bg-white placeholder:text-[${narravitMuted}] focus:border-[${narravitGreen}]`;
const readonlyInputClass = `${inputClass} cursor-default border-transparent bg-transparent caret-transparent`;

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
      className={`flex w-full flex-col gap-4 bg-white px-5 py-6 sm:gap-5 sm:px-8 sm:py-8 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="[font-family:var(--font-pt-serif)] text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-8"
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
        <span className="[font-family:var(--font-lato)] text-sm leading-5 text-[#848484]">
          {label}
        </span>
        <p className="[font-family:var(--font-lato)] mt-1 min-h-[3.25rem] text-xs leading-relaxed text-[#848484]/90 sm:min-h-[3.75rem] xl:min-h-[5.25rem]">
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
      className={`[font-family:var(--font-lato)] h-12 w-full shrink-0 bg-[#D0BCA6] px-6 text-base font-bold leading-6 text-white transition-colors hover:bg-[#c0ad98] disabled:opacity-50 sm:w-auto sm:min-w-[186px] ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Account-Übersicht ───────────────────────────────────────────────────────

function AccountSection({
  fullName,
  email,
  memberSince,
}: {
  fullName: string;
  email: string;
  memberSince: string;
}) {
  const [nameState, nameFormAction, namePending] = useActionState<UpdateNameState, FormData>(
    updateNameAction,
    {},
  );
  const [emailState, emailFormAction, emailPending] = useActionState<ChangeEmailState, FormData>(
    changeEmailAction,
    {},
  );

  // Show toasts on state changes
  if (nameState.success) {
    toast.success("Name gespeichert.");
  }
  if (emailState.success) {
    toast.success("Bestätigungs-E-Mail verschickt. Bitte bestätige deine neue Adresse.");
  }

  const memberLabel = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date(memberSince));

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
      <p className="max-w-3xl text-sm leading-6 text-[#535252] sm:text-base">
        Diese Angaben nutzen wir für Anzeigen in der App, E-Mail-Versand und Ihre
        Mitgliedschaft. Passen Sie Name und E-Mail bei Bedarf an.
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
              className="min-h-[4.5rem] text-xs leading-5 text-[#848484] sm:min-h-[4.75rem] xl:min-h-[5.5rem]"
            >
              Tipp: Verwenden Sie den Namen, mit dem Sie angesprochen werden
              möchten.
            </p>
            {nameState.error && (
              <p className="text-sm text-destructive">{nameState.error}</p>
            )}
            <SandButton type="submit" disabled={namePending}>
              {namePending ? "Wird gespeichert …" : "Name speichern"}
            </SandButton>
          </form>
        </FieldCard>

        {/* E-Mail */}
        <FieldCard
          label="E-Mail"
          hint="An diese Adresse senden wir Login-Hinweise, Rechnungen und wichtige Hinweise zu Ihren Projekten."
          pinContentToBottom
        >
          <form action={emailFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="currentEmail" value={email} />
            <input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={email}
              className={`${editableInputClass} text-[#3E3831]`}
              aria-describedby="account-email-hint"
            />
            <p
              id="account-email-hint"
              className="min-h-[4.5rem] text-xs leading-5 text-[#848484] sm:min-h-[4.75rem] xl:min-h-[5.5rem]"
            >
              Stellen Sie sicher, dass Sie Zugriff auf dieses Postfach haben —
              sonst verpassen Sie ggf. den Link zum Passwort-Zurücksetzen.
            </p>
            {emailState.success ? (
              <p className="text-sm text-[#96B897]">
                Bitte bestätige deine neue E-Mail-Adresse — wir haben dir einen
                Link geschickt. Die alte Adresse bleibt bis zur Bestätigung aktiv.
              </p>
            ) : emailState.error ? (
              <p className="text-sm text-destructive">{emailState.error}</p>
            ) : null}
            <SandButton type="submit" disabled={emailPending || !!emailState.success}>
              {emailPending ? "Wird gesendet …" : "E-Mail ändern"}
            </SandButton>
          </form>
        </FieldCard>

        {/* Mitglied seit */}
        <FieldCard
          label="Mitglied seit"
          hint="Ihr Startdatum bei NARRAVIT — hilfreich für Support-Anfragen oder bei Fragen zur Abrechnung."
          pinContentToBottom
        >
          <input
            id="account-member-since"
            name="memberSince"
            type="text"
            readOnly
            tabIndex={-1}
            aria-readonly="true"
            value={memberLabel}
            onChange={() => {}}
            className={`${readonlyInputClass} text-[#3E3831]`}
            aria-describedby="account-member-hint"
          />
          <p
            id="account-member-hint"
            className="min-h-[4.5rem] text-xs leading-5 text-[#848484] sm:min-h-[4.75rem] xl:min-h-[5.5rem]"
          >
            Das Startdatum können Sie nicht selbst ändern; es wird bei der
            Registrierung gesetzt.
          </p>
        </FieldCard>
      </div>
    </SectionShell>
  );
}

// ─── Mein Zugang ─────────────────────────────────────────────────────────────

function AccessSection({ accessExpiresAt }: { accessExpiresAt: string | null }) {
  if (!accessExpiresAt) return null;

  const expiryDate = new Date(accessExpiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isWarning = daysLeft <= 30;

  const formattedDate = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(expiryDate);

  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Mein Zugang</SectionHeading>
        <p className="max-w-3xl text-sm leading-6 text-[#535252] sm:text-base">
          Hier sehen Sie, wie lange Ihr NARRAVIT-Portalzugang noch aktiv ist.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-col gap-1">
          <span className="[font-family:var(--font-lato)] text-sm text-[#848484]">
            Zugang gültig bis
          </span>
          <span className="[font-family:var(--font-lato)] text-lg font-bold text-[#3E3831]">
            {formattedDate}
          </span>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-bold ${
            isWarning
              ? "bg-amber-50 text-amber-700"
              : "bg-[#96B897]/10 text-[#5a8a5b]"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isWarning ? "bg-amber-500" : "bg-[#96B897]"}`}
          />
          {daysLeft > 0
            ? `Noch ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`
            : "Zugang abgelaufen"}
        </div>
      </div>

      {isWarning && (
        <p className="max-w-xl text-sm leading-relaxed text-amber-700">
          Dein Zugang läuft bald ab — verlängere ihn in der Projektübersicht.
        </p>
      )}
    </SectionShell>
  );
}

// ─── Rechnungen (Placeholder) ────────────────────────────────────────────────

function InvoiceSection() {
  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Rechnungen</SectionHeading>
        <p className="max-w-3xl text-sm leading-6 text-[#535252] sm:text-base">
          Hier finden Sie alle bisherigen Belege und Zahlungsnachweise — ideal
          für die Buchhaltung oder wenn Sie eine Übersicht über Ihre Ausgaben bei
          uns brauchen.
        </p>
      </div>

      {/* Placeholder table */}
      <div className="border border-[#e0dcd5]">
        <div className="grid grid-cols-4 border-b border-[#e0dcd5] bg-[#FAF8F6] px-4 py-2">
          {["Datum", "Betrag", "Typ", "Rechnung"].map((h) => (
            <span key={h} className="text-xs font-bold uppercase tracking-wide text-[#848484]">
              {h}
            </span>
          ))}
        </div>
        <div className="px-4 py-6 text-center text-sm text-[#848484]">
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
            <p className="[font-family:var(--font-lato)] max-w-4xl text-base font-semibold leading-7 text-[#3E3831] sm:leading-8">
              Mit dem Klick auf „Passwort zurücksetzen" erhalten Sie eine E-Mail
              von uns mit einem sicheren Link, über den Sie ein neues Passwort
              vergeben können.
            </p>
            <p className="max-w-3xl text-sm leading-6 text-[#535252]">
              Wir empfehlen ein starkes, einzigartiges Passwort und regelmäßige
              Aktualisierung, besonders wenn Sie sich auf einem gemeinsam
              genutzten Gerät angemeldet haben.
            </p>
          </>
        ) : (
          <p className="max-w-3xl text-sm leading-6 text-[#535252]">
            Du meldest dich über {providerLabel} an — die Passwort-Verwaltung
            erfolgt dort.
          </p>
        )}
      </div>

      {isEmailProvider && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 max-w-xl">
            {state.success ? (
              <p className="text-sm text-[#96B897]">
                Wir haben dir einen Link zum Zurücksetzen geschickt. Bitte prüfe
                auch deinen Spam-Ordner.
              </p>
            ) : (
              <p className="text-sm text-[#848484]">
                Sie bleiben während des Vorgangs angemeldet; nach erfolgreicher
                Änderung sollten Sie sich neu anmelden.
              </p>
            )}
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
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
        <p className="[font-family:var(--font-lato)] max-w-3xl text-base font-semibold leading-7 text-[#D00018] sm:leading-8">
          Achtung: Das Löschen ist unwiderruflich — Sie verlieren den Zugang zu
          Ihrem Account und zu allen zugehörigen Inhalten.
        </p>
        <p className="max-w-3xl text-sm leading-6 text-[#535252] sm:text-base">
          Exportieren Sie vorher ggf. wichtige Texte oder Bilder. Nach Abschluss
          können weder Projekte noch Rechnungen wiederhergestellt werden.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-[#848484]">
          Nutzen Sie diese Option nur, wenn Sie sicher sind. Bei Unsicherheiten
          wenden Sie sich vorher an den Support.
        </p>

        <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmation(""); }}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="[font-family:var(--font-lato)] h-12 w-full shrink-0 bg-[#53444B] px-4 text-center text-base font-bold leading-6 text-white transition-colors hover:bg-[#45383e] sm:w-auto sm:max-w-md sm:px-6"
            >
              Ihren Account und Ihre Daten unwiderruflich löschen
            </button>
          </AlertDialogTrigger>

          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[#3E3831]">
                Account wirklich löschen?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-3 text-[#535252]">
                  <p>
                    Diese Aktion ist <strong>unwiderruflich</strong>. Alle Ihre
                    Projekte, Kapitel und Daten werden dauerhaft entfernt.
                  </p>

                  {isSoleOwner && (
                    <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      Du bist auf {state.soleOwnerCount}{" "}
                      {state.soleOwnerCount === 1 ? "Projekt" : "Projekten"} der
                      einzige Projektleiter. Übertrage die Projektleiterschaft oder
                      lösche die Projekte zuerst.
                    </div>
                  )}

                  {state.error && !isSoleOwner && (
                    <p className="text-sm text-destructive">{state.error}</p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="delete-confirm" className="text-xs font-bold text-[#3E3831]">
                      Tippe <strong>LÖSCHEN</strong> zur Bestätigung:
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      placeholder="LÖSCHEN"
                      className="h-10"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel className="h-10">Abbrechen</AlertDialogCancel>
              <form action={formAction}>
                <button
                  type="submit"
                  disabled={!isConfirmed || pending}
                  className="[font-family:var(--font-lato)] h-10 w-full bg-[#53444B] px-5 text-sm font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
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
  memberSince: string;
  accessExpiresAt: string | null;
  authProvider: string;
}

export function PersonalAreaClient({
  fullName,
  email,
  memberSince,
  accessExpiresAt,
  authProvider,
}: PersonalAreaProps) {
  return (
    <main
      className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-16 pt-8 sm:px-6 sm:pt-10 md:px-8 md:pt-12"
    >
      <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">
        {/* Banner */}
        <div className="relative h-[min(31.5vh,285px)] w-full min-h-[105px] overflow-hidden sm:min-h-[135px]">
          <Image
            src="/persoenlicher-bereich-banner.png"
            alt="Person mit Laptop auf einem Ledersofa — stimmungsvolles Bannerbild."
            fill
            className="object-cover blur-[2px]"
            sizes="(max-width: 768px) 100vw, 1213px"
            priority
          />
        </div>

        {/* Header */}
        <header className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="[font-family:var(--font-merriweather)] w-full text-[1.75rem] font-medium leading-9 text-[#3E3831] sm:text-[2rem] sm:leading-10 md:text-4xl md:leading-10">
            Persönlicher Bereich
          </h1>
          <p className="mx-auto max-w-3xl text-base leading-6 text-[#535252]">
            Hier verwalten Sie die wichtigsten Angaben zu Ihrem NARRAVIT-Konto,
            Ihre Abrechnung und sicherheitsrelevante Aktionen — alles an einem
            Ort, übersichtlich gegliedert.
          </p>
        </header>

        {/* Sections */}
        <div className="flex flex-col gap-6 sm:gap-8">
          <AccountSection fullName={fullName} email={email} memberSince={memberSince} />
          <AccessSection accessExpiresAt={accessExpiresAt} />
          <InvoiceSection />
          <SecuritySection authProvider={authProvider} />
          <DeleteAccountSection />
        </div>
      </div>
    </main>
  );
}
