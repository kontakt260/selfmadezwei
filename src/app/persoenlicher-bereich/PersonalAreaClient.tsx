"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { TURNSTILE_ENABLED, TurnstileField } from "@/components/auth/TurnstileField";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountDeletionOverview } from "@/lib/account/account-deletion";
import {
  updateNameAction,
  resetPasswordAction,
  deleteAccountAction,
  getAccountDeletionOverviewAction,
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
              value={nameValue}
              onChange={(event) => setNameValue(event.target.value)}
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
        <SectionHeading>Sicherheit</SectionHeading>
        {isEmailProvider ? (
          <>
            <p className="[font-family:var(--font-lato)] max-w-4xl text-lg font-semibold leading-8 text-[#3E3831] sm:text-xl sm:leading-9">
              Mit dem Klick auf „Passwort zurücksetzen&quot; erhalten Sie eine E-Mail
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
          <>
            {hasPassword ? (
              <p className="[font-family:var(--font-lato)] max-w-4xl text-lg font-semibold leading-8 text-[#3E3831] sm:text-xl sm:leading-9">
                Sie melden sich über {providerLabel} an und haben zusätzlich
                ein Passwort festgelegt. Mit dem Klick auf „Passwort ändern&quot;
                erhalten Sie eine E-Mail von uns mit einem sicheren Link, über
                den Sie ein neues Passwort vergeben können.
              </p>
            ) : (
              <p className="[font-family:var(--font-lato)] max-w-4xl text-lg font-semibold leading-8 text-[#3E3831] sm:text-xl sm:leading-9">
                Sie melden sich über {providerLabel} an. Wenn Sie sich
                zusätzlich mit einer E-Mail-Adresse und einem Passwort
                anmelden möchten, können Sie hier ein Passwort festlegen.
              </p>
            )}
            <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
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
            <p className="text-base leading-7 text-[#96B897]">
              Wir haben Ihnen einen Link zum Zurücksetzen geschickt. Bitte prüfen Sie
              auch Ihren Spam-Ordner.
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
        <form action={formAction} className="relative flex flex-col gap-2">
          <TurnstileField onReadyChange={setCaptchaReady} resetSignal={state} />
          <SandButton type="submit" disabled={pending || !!state.success || !captchaReady}>
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

// ─── Account löschen ─────────────────────────────────────────────────────────

function candidateName(candidate: { fullName: string; email: string }): string {
  return candidate.fullName.trim() || candidate.email || "Projektmitglied";
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [overview, setOverview] = useState<AccountDeletionOverview | null>(null);
  const [account, setAccount] = useState<{ fullName: string; email: string } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successors, setSuccessors] = useState<Record<string, string>>({});

  const loadOverview = useCallback(async () => {
    setOverview(null);
    setOverviewError(null);
    setOverviewLoading(true);
    try {
      const result = await getAccountDeletionOverviewAction();
      if (!result.overview) {
        setOverviewError(result.error ?? "Die Übersicht konnte nicht geladen werden.");
        return;
      }
      setOverview(result.overview);
      setAccount(result.account ?? null);
      // Vorausgewählt ist die am längsten beteiligte Person.
      setSuccessors(
        Object.fromEntries(
          result.overview.keep
            .filter((project) => project.candidates.length > 0)
            .map((project) => [project.projectId, project.candidates[0].userId]),
        ),
      );
    } catch {
      setOverviewError("Die Übersicht konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const [, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    async (previous, formData) => {
      const result = await deleteAccountAction(previous, formData);
      setDialogError(result.error ?? null);
      if (result.overviewChanged) {
        setConfirmation("");
        await loadOverview();
      }
      return result;
    },
    {},
  );

  const isConfirmed = confirmation === "LÖSCHEN";
  const projectsNeedingSuccessor =
    overview?.keep.filter((project) => project.candidates.length > 0) ?? [];
  const successorsComplete = projectsNeedingSuccessor.every((project) =>
    Boolean(successors[project.projectId]),
  );
  const canDelete =
    isConfirmed && overview !== null && !overviewLoading && successorsComplete && !pending;
  const accountName = account?.fullName.trim();
  const accountLabel = accountName ? `${accountName} (${account?.email})` : (account?.email ?? "");

  return (
    <SectionShell>
      <div className="flex flex-col gap-2">
        <SectionHeading>Account löschen</SectionHeading>
        <p className="[font-family:var(--font-lato)] max-w-3xl text-lg font-semibold leading-8 text-[#D00018] sm:text-xl sm:leading-9">
          Achtung: Das Löschen ist unwiderruflich. Sie verlieren den Zugang zu
          Ihrem Account und zu allen Ihren Projekten.
        </p>
        <p className="max-w-3xl text-base leading-7 text-[#535252] sm:text-lg sm:leading-8">
          Projekte, in denen nur Sie mitwirken, werden mitgelöscht. Gemeinsame
          Projekte bleiben für die anderen Mitglieder bestehen.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-base leading-7 text-[#848484] sm:text-lg sm:leading-8">
          Nutzen Sie diese Option nur, wenn Sie sicher sind. Bei Unsicherheiten
          wenden Sie sich vorher an den Support.
        </p>

        <AlertDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) {
              setDialogError(null);
              void loadOverview();
            } else {
              setConfirmation("");
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="[font-family:var(--font-lato)] h-12 w-full shrink-0 whitespace-nowrap bg-[#53444B] px-4 text-center text-lg font-bold leading-6 text-white transition-colors hover:bg-[#45383e] sm:w-auto sm:px-6"
            >
              Account löschen
            </button>
          </AlertDialogTrigger>

          <AlertDialogContent
            className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto p-5 sm:max-w-2xl sm:p-8"
            onOverlayClick={() => {
              setOpen(false);
              setConfirmation("");
            }}
          >
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle className="text-2xl font-normal leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
                Account wirklich löschen?
              </AlertDialogTitle>
              <AlertDialogDescription
                asChild
                className="text-base leading-7 text-[#535252] sm:text-lg sm:leading-8"
              >
                <div className="flex flex-col gap-4">
                  <p>
                    Das Löschen kann <strong>nicht rückgängig</strong> gemacht
                    werden. Rechnungen müssen wir aus steuerlichen Gründen acht
                    Jahre aufbewahren.
                  </p>

                  {overviewLoading && <p role="status">Ihre Projekte werden geladen …</p>}

                  {overviewError && (
                    <div className="flex flex-col items-start gap-2 border border-destructive/30 bg-destructive/5 p-4 text-base leading-7 text-destructive">
                      <p>{overviewError}</p>
                      <button
                        type="button"
                        onClick={() => void loadOverview()}
                        className="font-bold underline underline-offset-4"
                      >
                        Erneut laden
                      </button>
                    </div>
                  )}

                  {overview && (
                    <>
                      <div className="flex flex-col gap-1">
                        <p className="font-bold text-[#3E3831]">Wird gelöscht</p>
                        <ul className="list-disc pl-5">
                          <li className="break-words">Ihr Account: {accountLabel}</li>
                          {overview.delete.map((project) => (
                            <li key={project.projectId} className="break-words">
                              Projekt „{project.title}“
                            </li>
                          ))}
                        </ul>
                      </div>

                      {(overview.keep.length > 0 || overview.otherCount > 0) && (
                        <div className="flex flex-col gap-1">
                          <p className="font-bold text-[#3E3831]">Bleibt bestehen</p>
                          {overview.keep.length > 0 && (
                            <ul className="list-disc pl-5">
                              {overview.keep.map((project) => (
                                <li key={project.projectId} className="break-words">
                                  Projekt „{project.title}“
                                </li>
                              ))}
                            </ul>
                          )}
                          {overview.otherCount > 0 && (
                            <p>
                              Verschenkte Bücher und Projekte, an denen Sie nicht mehr
                              beteiligt sind, bleiben für die anderen bestehen.
                            </p>
                          )}
                          {overview.keep.length > 0 && (
                            <p>
                              Möchten Sie eigene Texte entfernen lassen, schreiben Sie
                              uns bitte vor der Löschung an{" "}
                              <a
                                href="mailto:kontakt@narravit.de"
                                className="underline underline-offset-4"
                              >
                                kontakt@narravit.de
                              </a>
                              .
                            </p>
                          )}
                        </div>
                      )}

                      {projectsNeedingSuccessor.map((project) => {
                        const labelId = `successor-${project.projectId}`;
                        return (
                          <div key={project.projectId} className="flex flex-col gap-2">
                            <p id={labelId} className="break-words font-bold text-[#3E3831]">
                              Sie sind die einzige Projektleitung. Wer soll „{project.title}“
                              weiterführen?
                            </p>
                            <Select
                              value={successors[project.projectId]}
                              onValueChange={(userId) =>
                                setSuccessors((current) => ({
                                  ...current,
                                  [project.projectId]: userId,
                                }))
                              }
                            >
                              <SelectTrigger
                                aria-labelledby={labelId}
                                className="h-12 text-base sm:text-lg"
                              >
                                <SelectValue placeholder="Person auswählen" />
                              </SelectTrigger>
                              <SelectContent className="z-[310]">
                                {project.candidates.map((candidate) => (
                                  <SelectItem key={candidate.userId} value={candidate.userId}>
                                    {candidateName(candidate)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {dialogError && <p className="text-base text-destructive">{dialogError}</p>}

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="delete-confirm" className="text-sm font-bold text-[#3E3831] sm:text-base">
                      Tippen Sie <strong>LÖSCHEN</strong> zur Bestätigung:
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
                <input type="hidden" name="confirmation" value={confirmation} />
                <input
                  type="hidden"
                  name="confirmedDelete"
                  value={JSON.stringify(overview?.delete.map((project) => project.projectId) ?? [])}
                />
                <input type="hidden" name="successors" value={JSON.stringify(successors)} />
                <button
                  type="submit"
                  disabled={!canDelete}
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
            <SecuritySection authProvider={authProvider} hasPassword={hasPassword} />
            <DeleteAccountSection />
          </div>
        </div>
      </main>
    </>
  );
}
