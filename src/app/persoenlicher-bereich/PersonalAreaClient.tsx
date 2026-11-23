"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { TURNSTILE_ENABLED, TurnstileField } from "@/components/auth/TurnstileField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateNameAction,
  resetPasswordAction,
  type UpdateNameState,
  type ResetPasswordState,
} from "./actions";
import { fieldTextClass, bodyTextClass, SectionShell, SectionHeading, SandButton } from "./personal-area-ui";
import { DeleteAccountSection } from "./DeleteAccountSection";

// ─── Ihre Angaben ────────────────────────────────────────────────────────────

function AccountSection({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const [nameValue, setNameValue] = useState(fullName);
  const [nameState, nameFormAction, namePending] = useActionState<UpdateNameState, FormData>(
    updateNameAction,
    {},
  );

  useEffect(() => {
    setNameValue(fullName);
  }, [fullName]);

  useEffect(() => {
    if (!nameState.success) return;
    if (nameState.fullName) setNameValue(nameState.fullName);
    toast.success("Name gespeichert.");
  }, [nameState.fullName, nameState.success]);

  return (
    <SectionShell className="gap-6">
      <SectionHeading>Ihre Angaben</SectionHeading>

      <form action={nameFormAction} className="flex flex-col gap-2">
        <Label htmlFor="account-name" className="text-lg font-bold text-[#3E3831]">
          Name
        </Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* Die unsichtbare Kopie gibt dem Feld die Höhe des umbrochenen Namens. */}
          <div className="grid min-w-0 flex-1">
            <div
              aria-hidden
              className={`${fieldTextClass} invisible col-start-1 row-start-1 whitespace-pre-wrap border-transparent`}
            >
              {nameValue || " "}
            </div>
            <Textarea
              id="account-name"
              name="name"
              rows={1}
              autoComplete="name"
              value={nameValue}
              onChange={(event) => setNameValue(event.target.value.replace(/\s*\n\s*/g, " "))}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className={`${fieldTextClass} col-start-1 row-start-1 resize-none overflow-hidden border-[#8E877E] bg-white text-[#26231F]`}
            />
          </div>
          <SandButton type="submit" disabled={namePending}>
            {namePending ? "Wird gespeichert …" : "Name speichern"}
          </SandButton>
        </div>
        {nameState.error && (
          <p role="alert" className="text-base text-destructive">
            {nameState.error}
          </p>
        )}
      </form>

      <dl className="flex flex-col gap-2">
        <dt className="text-lg font-bold leading-none text-[#3E3831]">E-Mail</dt>
        <dd
          id="account-email"
          className={`${fieldTextClass} border-[#D5D0C9] bg-[#F8F7F5] text-[#4A453F]`}
        >
          {email}
        </dd>
      </dl>
    </SectionShell>
  );
}

// ─── Rechnungen ──────────────────────────────────────────────────────────────

function InvoiceSection() {
  return (
    <SectionShell className="gap-2">
      <SectionHeading>Rechnungen</SectionHeading>
      <p className={bodyTextClass}>
        Ihre Rechnung erhalten Sie nach jedem Kauf per E-Mail. Falls Sie sie nicht mehr
        finden, schreiben Sie uns an{" "}
        <a
          href="mailto:kontakt@narravit.de"
          className="break-words text-[#3E3831] underline underline-offset-4 hover:text-[#0A0909]"
        >
          kontakt@narravit.de
        </a>
        .
      </p>
    </SectionShell>
  );
}

// ─── Passwort ───────────────────────────────────────────────────────────────

function SecuritySection({
  authProvider,
  hasPassword,
}: {
  authProvider: string;
  hasPassword: boolean;
}) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    {},
  );
  const [captchaReady, setCaptchaReady] = useState(!TURNSTILE_ENABLED);

  const isEmailProvider = authProvider === "email";
  const providerLabel =
    authProvider === "google"
      ? "Google"
      : authProvider === "facebook"
        ? "Facebook"
        : authProvider === "apple"
          ? "Apple"
          : authProvider;

  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Passwort</SectionHeading>
        {isEmailProvider ? (
          <>
            <p className={bodyTextClass}>
              Mit dem Klick auf „Passwort zurücksetzen&quot; erhalten Sie eine E-Mail
              von uns mit einem sicheren Link, über den Sie ein neues Passwort
              vergeben können.
            </p>
            <p className={bodyTextClass}>
              Wir empfehlen ein starkes, einzigartiges Passwort und regelmäßige
              Aktualisierung, besonders wenn Sie sich auf einem gemeinsam
              genutzten Gerät angemeldet haben.
            </p>
          </>
        ) : (
          <>
            {hasPassword ? (
              <p className={bodyTextClass}>
                Sie melden sich über {providerLabel} an und haben zusätzlich
                ein Passwort festgelegt. Mit dem Klick auf „Passwort ändern&quot;
                erhalten Sie eine E-Mail von uns mit einem sicheren Link, über
                den Sie ein neues Passwort vergeben können.
              </p>
            ) : (
              <p className={bodyTextClass}>
                Sie melden sich über {providerLabel} an. Wenn Sie sich
                zusätzlich mit einer E-Mail-Adresse und einem Passwort
                anmelden möchten, können Sie hier ein Passwort festlegen.
              </p>
            )}
            <p className={bodyTextClass}>
              {hasPassword
                ? `Die Anmeldung über ${providerLabel} funktioniert weiterhin wie gewohnt.`
                : `Sie erhalten dazu eine E-Mail mit einem sicheren Link. Die Anmeldung über ${providerLabel} funktioniert danach weiterhin wie gewohnt.`}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1 max-w-xl">
          {state.success ? (
            <p className="text-base font-bold leading-7 text-[#2B452F] sm:text-lg">
              Wir haben Ihnen einen Link zum Zurücksetzen geschickt. Bitte prüfen Sie
              auch Ihren Spam-Ordner.
            </p>
          ) : (
            <p className="text-base leading-7 text-[#5F5A54] sm:text-lg">
              Sie bleiben während des Vorgangs angemeldet; nach erfolgreicher
              Änderung sollten Sie sich neu anmelden.
            </p>
          )}
          {state.error && (
            <p className="text-base text-destructive">{state.error}</p>
          )}
        </div>
        <form action={formAction} className="relative flex flex-col gap-2">
          <TurnstileField onReadyChange={setCaptchaReady} resetSignal={state} />
          <SandButton
            type="submit"
            disabled={pending || !!state.success || !captchaReady}
            className="border-[#EFEBE5] bg-[#EFEBE5] text-[#1F1C19] hover:border-[#E4DFD8] hover:bg-[#E4DFD8]"
          >
            {pending
              ? "Wird gesendet …"
              : isEmailProvider
                ? "Passwort zurücksetzen"
                : hasPassword
                  ? "Passwort ändern"
                  : "Passwort festlegen"}
          </SandButton>
        </form>
      </div>
    </SectionShell>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface PersonalAreaProps {
  fullName: string;
  email: string;
  authProvider: string;
  hasPassword: boolean;
}

export function PersonalAreaClient({
  fullName,
  email,
  authProvider,
  hasPassword,
}: PersonalAreaProps) {
  return (
    <>
      <Navbar />
      <main
        className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-16 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12"
      >
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
          <header className="flex flex-col gap-2.5 pb-3">
            <h1 className="text-[clamp(2.375rem,3.6vw,3.375rem)] leading-[1.12] text-[#3E3831]">
              Persönlicher Bereich
            </h1>
            <p className="text-xl leading-normal text-[#4A453F] sm:text-[1.3125rem]">
              Ihre Daten, Rechnungen und Konto
            </p>
          </header>

          <AccountSection fullName={fullName} email={email} />
          <InvoiceSection />
          <SecuritySection authProvider={authProvider} hasPassword={hasPassword} />
          <DeleteAccountSection />
        </div>
      </main>
    </>
  );
}
