"use client";

import { useActionState, useCallback, useState } from "react";
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
import { deleteAccountAction, getAccountDeletionOverviewAction, type DeleteAccountState } from "./actions";
import { bodyTextClass, SectionShell, SectionHeading } from "./personal-area-ui";

// ─── Konto löschen ───────────────────────────────────────────────────────────

function candidateName(candidate: { fullName: string; email: string }): string {
  return candidate.fullName.trim() || candidate.email || "Projektmitglied";
}

export function DeleteAccountSection() {
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
