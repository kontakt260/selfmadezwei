"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  accentColorForStableId,
  accentForegroundForBackground,
} from "@/lib/projektuebersicht-palette";
import {
  createInvitationAction,
  removeMemberAction,
  leaveProjectAction,
} from "@/app/projektuebersicht/[project_id]/members-actions";

// PROJ-9 — Mitgliederliste + Verwaltungs-Interaktionen.
//
// Rollen sind einmal vergeben fest (Refine 2026-05-21). Eigene Rolle
// bestimmt, welche Controls sichtbar sind:
//   - "projektleiter": Trash-Button pro Mitglied (außer eigenes),
//                      Last-PL-Konstellation disabled den Trash.
//   - "co_author":     reine Anzeige, kein Modal-Trigger.
//
// Alle Schreibvorgänge gehen über Server-Actions (s. members-actions.ts).
// Bei Erfolg → router.refresh(), bei Fehler → toast.

export type MemberDisplay = {
  /** project_members.id */
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  role: "projektleiter" | "co_author";
  isMe: boolean;
};

type Props = {
  projectId: string;
  members: MemberDisplay[];
  myRole: "projektleiter" | "co_author";
};

const ROLE_LABEL: Record<MemberDisplay["role"], string> = {
  projektleiter: "Projektleiter:in",
  co_author: "Co-Autor:in",
};

function plCountOf(members: MemberDisplay[]): number {
  return members.filter((m) => m.role === "projektleiter").length;
}

function displayName(m: MemberDisplay): string {
  const t = (m.fullName ?? "").trim();
  if (t.length > 0) return t;
  const local = (m.email ?? "").split("@")[0] ?? "";
  return local.length > 0 ? local.charAt(0).toUpperCase() + local.slice(1) : "Anonym";
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}

export function ProjectUsersClient({ projectId, members, myRole }: Props) {
  const router = useRouter();
  const isPL = myRole === "projektleiter";
  const plCount = plCountOf(members);

  // Add-User-Modal-State
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<"input" | "link">("input");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<MemberDisplay["role"]>("co_author");
  const [addError, setAddError] = useState<string | null>(null);
  const [addedLink, setAddedLink] = useState<string | null>(null);
  const [addPending, startAddTransition] = useTransition();
  const [linkCopied, setLinkCopied] = useState(false);

  // Confirm-Modale
  const [confirmRemove, setConfirmRemove] = useState<MemberDisplay | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [actionPending, startActionTransition] = useTransition();

  const openAdd = () => {
    setAddStep("input");
    setAddEmail("");
    setAddRole("co_author");
    setAddError(null);
    setAddedLink(null);
    setLinkCopied(false);
    setAddOpen(true);
  };

  const closeAdd = () => setAddOpen(false);

  const submitAdd = () => {
    setAddError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("email", addEmail);
    fd.set("role", addRole);
    startAddTransition(async () => {
      const res = await createInvitationAction(fd);
      if (res.error || !res.acceptUrl) {
        setAddError(res.error ?? "Einladung fehlgeschlagen.");
        return;
      }
      setAddedLink(res.acceptUrl);
      setAddStep("link");
      router.refresh();
    });
  };

  const copyLink = async () => {
    if (!addedLink) return;
    try {
      await navigator.clipboard.writeText(addedLink);
      setLinkCopied(true);
      toast.success("Link in die Zwischenablage kopiert.");
    } catch {
      toast.error("Kopieren fehlgeschlagen — bitte manuell markieren.");
    }
  };

  const handleRemoveConfirmed = () => {
    if (!confirmRemove) return;
    const target = confirmRemove;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("memberId", target.memberId);
    startActionTransition(async () => {
      const res = await removeMemberAction(fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${displayName(target)} wurde entfernt.`);
      setConfirmRemove(null);
      router.refresh();
    });
  };

  const handleLeaveConfirmed = () => {
    const fd = new FormData();
    fd.set("projectId", projectId);
    startActionTransition(async () => {
      const res = await leaveProjectAction(fd);
      // leaveProjectAction redirected; nur reachable falls Server-Action
      // einen Fehler zurückgab.
      if (res.error) {
        toast.error(res.error);
        setConfirmLeaveOpen(false);
      }
    });
  };

  const meMember = members.find((m) => m.isMe);
  const canLeave =
    meMember !== undefined &&
    !(meMember.role === "projektleiter" && plCount === 1);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="[font-family:var(--font-pt-serif)] text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
          Nutzerübersicht
        </h2>
        {isPL && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-12 items-center justify-center gap-2 bg-[#D0BCA6] px-5 text-base font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98] sm:text-lg"
          >
            <PlusIcon /> Nutzer hinzufügen
          </button>
        )}
      </div>

      {/* Mitglieder-Liste */}
      <ul className="flex flex-col divide-y divide-[#e0dcd5] border border-[#e0dcd5] bg-white">
        {members.map((m) => {
          const name = displayName(m);
          const accent = accentColorForStableId(m.userId);
          const fg = accentForegroundForBackground(accent);
          const isLastPL = m.role === "projektleiter" && plCount === 1;
          return (
            <li
              key={m.memberId}
              className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold sm:h-12 sm:w-12 sm:text-lg"
                  style={{ backgroundColor: accent, color: fg }}
                >
                  {initialOf(name)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p
                    className="truncate text-base font-semibold text-[#3E3831] sm:text-lg"
                    title={name}
                  >
                    {name}
                    {m.isMe && (
                      <span className="ml-2 text-sm font-normal text-[#848484]">
                        (Du)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-[#848484] sm:text-base" title={m.email}>
                    {m.email}
                  </p>
                </div>
              </div>

              <div className="flex flex-row items-center gap-2 sm:gap-3">
                <span className="text-sm text-[#535252] sm:text-base">
                  {ROLE_LABEL[m.role]}
                </span>
                {isPL && (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(m)}
                      disabled={actionPending || isLastPL || m.isMe}
                      title={
                        isLastPL
                          ? "Mindestens ein Projektleiter muss verbleiben."
                          : m.isMe
                            ? "Nutze die Projekt-verlassen-Schaltfläche, um dich selbst zu entfernen."
                            : "Mitglied entfernen"
                      }
                      aria-label={`Mitglied „${name}" entfernen`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#e0dcd5] bg-white text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Projekt verlassen */}
      <div className="flex">
        <button
          type="button"
          onClick={() => setConfirmLeaveOpen(true)}
          disabled={!canLeave || actionPending}
          title={!canLeave ? "Befördere zuerst eine andere Person zum Projektleiter." : undefined}
          className="inline-flex h-12 items-center justify-center border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
        >
          Projekt verlassen
        </button>
      </div>

      {/* Add-User-Modal */}
      {addOpen && (
        <ModalShell onClose={closeAdd} titleId="add-user-title">
          {addStep === "input" ? (
            <>
              <h3 id="add-user-title" className="[font-family:var(--font-pt-serif)] text-2xl text-[#3E3831] sm:text-3xl">
                Nutzer einladen
              </h3>
              <p className="text-base leading-7 text-[#535252] sm:text-lg">
                Trage die E-Mail-Adresse der Person ein und wähle ihre Rolle.
                Nach Abschluss bekommst du einen Link, den du manuell
                weiterleitest (z. B. per WhatsApp oder Mail).
              </p>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#3E3831]">E-Mail-Adresse</span>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="name@beispiel.de"
                  autoComplete="email"
                  className="h-12 border border-[#e0dcd5] bg-white px-3 text-base text-[#3E3831] focus:outline-none focus:ring-2 focus:ring-[#3E3831]/30 sm:text-lg"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#3E3831]">Rolle</span>
                <select
                  value={addRole}
                  onChange={(e) =>
                    setAddRole(e.target.value as MemberDisplay["role"])
                  }
                  className="h-12 border border-[#e0dcd5] bg-white px-3 text-base text-[#3E3831] focus:outline-none focus:ring-2 focus:ring-[#3E3831]/30 sm:text-lg"
                >
                  <option value="co_author">Co-Autor:in</option>
                  <option value="projektleiter">Projektleiter:in</option>
                </select>
              </label>
              {addError && (
                <p className="text-base text-destructive" role="alert">
                  {addError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
                <button
                  type="button"
                  onClick={closeAdd}
                  disabled={addPending}
                  className="h-12 border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:text-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={submitAdd}
                  disabled={addPending || !isLikelyValidEmail(addEmail)}
                  className="h-12 bg-[#D0BCA6] px-5 text-base font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
                >
                  {addPending ? "Einladung wird erstellt …" : "Einladen"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 id="add-user-title" className="[font-family:var(--font-pt-serif)] text-2xl text-[#3E3831] sm:text-3xl">
                Einladung erstellt
              </h3>
              <p className="text-base leading-7 text-[#535252] sm:text-lg">
                Einladung für <span className="font-semibold">{addEmail}</span> wurde
                angelegt. Bitte leite den folgenden Link manuell an die Person
                weiter — er ist 14 Tage gültig.
              </p>
              <div className="flex flex-col gap-2 break-all border border-[#e0dcd5] bg-[#FAF8F6] p-3 text-sm text-[#535252] sm:text-base">
                {addedLink}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="h-12 border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] sm:text-lg"
                >
                  Schließen
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  className="h-12 bg-[#D0BCA6] px-5 text-base font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98] sm:text-lg"
                >
                  {linkCopied ? "Kopiert ✓" : "Link kopieren"}
                </button>
              </div>
            </>
          )}
        </ModalShell>
      )}

      {/* Confirm-Remove-Modal */}
      {confirmRemove && (
        <ModalShell
          onClose={() => !actionPending && setConfirmRemove(null)}
          titleId="confirm-remove-title"
        >
          <h3 id="confirm-remove-title" className="[font-family:var(--font-pt-serif)] text-2xl text-[#3E3831] sm:text-3xl">
            Mitglied entfernen?
          </h3>
          <p className="text-base leading-7 text-[#535252] sm:text-lg">
            Möchtest du{" "}
            <span className="font-semibold">{displayName(confirmRemove)}</span>{" "}
            wirklich aus dem Projekt entfernen? Der Nutzer verliert den
            Zugriff auf dieses Projekt.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              disabled={actionPending}
              className="h-12 border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:text-lg"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleRemoveConfirmed}
              disabled={actionPending}
              className="h-12 bg-[#53444B] px-5 text-base font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
            >
              {actionPending ? "Wird entfernt …" : "Endgültig entfernen"}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Confirm-Leave-Modal */}
      {confirmLeaveOpen && (
        <ModalShell
          onClose={() => !actionPending && setConfirmLeaveOpen(false)}
          titleId="confirm-leave-title"
        >
          <h3 id="confirm-leave-title" className="[font-family:var(--font-pt-serif)] text-2xl text-[#3E3831] sm:text-3xl">
            Projekt verlassen?
          </h3>
          <p className="text-base leading-7 text-[#535252] sm:text-lg">
            Möchtest du dieses Projekt wirklich verlassen? Du verlierst den
            Zugriff auf die Kapitel und alle Projekt-Daten.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
            <button
              type="button"
              onClick={() => setConfirmLeaveOpen(false)}
              disabled={actionPending}
              className="h-12 border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50 sm:text-lg"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleLeaveConfirmed}
              disabled={actionPending}
              className="h-12 bg-[#53444B] px-5 text-base font-bold text-white transition-colors hover:bg-[#45383e] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
            >
              {actionPending ? "Wird verlassen …" : "Projekt verlassen"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ─── Sub-Komponenten ───────────────────────────────────────────────────────
//
// RoleToggle wurde am 2026-05-21 entfernt — Rollen sind nach Einladung
// fest. Soll jemand eine andere Rolle bekommen, entferne ihn und sende
// eine neue Einladung mit der gewünschten Rolle.

function ModalShell({
  onClose,
  titleId,
  children,
}: {
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xl flex-col gap-5 bg-white p-6 sm:gap-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isLikelyValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
