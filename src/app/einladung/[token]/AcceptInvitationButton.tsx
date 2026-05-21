"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/app/projektuebersicht/[project_id]/members-actions";

// PROJ-9 — Accept-Button auf der /einladung/[token]-Seite.
// Server-Action ruft acceptInvitationAction; bei Erfolg navigiert der
// Client zur Projektübersicht. Bei Fehler wird die Meldung inline gezeigt.

type Props = {
  token: string;
  projectId: string;
};

export function AcceptInvitationButton({ token, projectId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await acceptInvitationAction(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.projectId) {
        router.push(`/projektuebersicht/${res.projectId}`);
      } else {
        // Fallback — sollte mit projectId aus Action nie passieren.
        router.push(`/projektuebersicht/${projectId}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:self-start"
      >
        {pending ? "Wird angenommen …" : "Annehmen"}
      </button>
      {error && (
        <p className="text-base text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
