"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { TURNSTILE_ENABLED, TurnstileField } from "@/components/auth/TurnstileField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import {
  updateNameAction,
  resetPasswordAction,
  deleteAccountAction,
  getAccountDeletionOverviewAction,
  type UpdateNameState,
  type ResetPasswordState,
  type DeleteAccountState,
} from "./actions";

// ─── Sub-components ──────────────────────────────────────────────────────────

// Name und E-Mail dürfen umbrechen, damit lange Angaben vollständig lesbar bleiben.
const fieldTextClass =
  "min-h-[3.375rem] w-full rounded-none border px-3.5 py-3 text-lg leading-7 [overflow-wrap:anywhere] sm:text-[1.1875rem] md:text-[1.1875rem]";
const bodyTextClass = "text-lg leading-normal text-[#4A453F] sm:text-[1.1875rem]";

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex w-full flex-col gap-5 border border-[#E0DCD5] bg-white p-5 sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[1.75rem] leading-tight text-[#3E3831] sm:text-3xl">{children}</h2>;
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
    <Button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-[3.375rem] w-full shrink-0 px-6 text-lg font-bold sm:w-auto", className)}
    >
      {children}
    </Button>
  );
}

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

// ─── Konto löschen ───────────────────────────────────────────────────────────

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
        <SectionHeading>Konto löschen</SectionHeading>
        <p className={bodyTextClass}>
          <strong className="text-[#9C1C1C]">Das Löschen ist unwiderruflich.</strong> Sie
          verlieren den Zugang zu Ihrem Konto und zu allen Ihren Projekten.
        </p>
        <p className={bodyTextClass}>
          Projekte, in denen nur Sie mitwirken, werden mitgelöscht. Gemeinsame
          Projekte bleiben für die anderen Mitglieder bestehen.
        </p>
      </div>

      <div className="flex">
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
              className="[font-family:var(--font-lato)] h-[3.375rem] w-full shrink-0 whitespace-nowrap bg-[#4A4240] px-6 text-center text-lg font-bold leading-6 text-white transition-colors hover:bg-[#3A3331] sm:w-auto"
            >
              Konto löschen
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
                Konto wirklich löschen?
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
                          <li className="break-words">Ihr Konto: {accountLabel}</li>
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
                                className="h-auto min-h-12 py-2 text-left text-base sm:text-lg [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere]"
                              >
                                <SelectValue placeholder="Person auswählen" />
                              </SelectTrigger>
                              <SelectContent className="z-[310] max-w-[calc(100vw-2rem)]">
                                {project.candidates.map((candidate) => (
                                  <SelectItem
                                    key={candidate.userId}
                                    value={candidate.userId}
                                    className="min-h-11 py-2 pr-3 text-base leading-6 [overflow-wrap:anywhere] focus:bg-[#EFEBE5] focus:text-[#1F1C19] sm:text-lg"
                                  >
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
                    <Label htmlFor="delete-confirm" className="text-base font-bold text-[#3E3831]">
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
                  {pending ? "Wird gelöscht …" : "Konto endgültig löschen"}
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
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
          <header className="flex flex-col gap-2.5 pb-3">
            <h1 className="text-[clamp(2.375rem,3.6vw,3.375rem)] leading-[1.12] text-[#3E3831]">
              Persönlicher Bereich
            </h1>
            <p className="text-xl leading-normal text-[#4A453F] sm:text-[1.3125rem]">
              Ihre Angaben, Rechnungen und Ihr Konto an einem Ort.
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
