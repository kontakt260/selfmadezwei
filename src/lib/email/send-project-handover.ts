import "server-only";
import type { ProjectHandover } from "@/lib/account/account-deletion";
import { ProjectHandoverEmail } from "@/emails/ProjectHandoverEmail";
import { sendInBackground } from "./background";
import { getSiteUrl, sendEmail, type SendMailResult } from "./client";
import { recordMailResult } from "./retry-queue";

// PROJ-3 — Mail an die neue Projektleitung. Scheitert der Versand, holt der
// tägliche Cron die Mail nach.

export type SendProjectHandoverInput = {
  to: string;
  fullName?: string;
  projectName: string;
  projectId: string;
};

/** Ein Versandversuch ohne Warteschlange — auch für das spätere Nachholen. */
export async function deliverProjectHandoverMail(
  input: SendProjectHandoverInput,
): Promise<SendMailResult> {
  return sendEmail({
    to: input.to,
    subject: `Sie leiten jetzt das Projekt „${input.projectName}“`,
    react: ProjectHandoverEmail({
      fullName: input.fullName,
      projectName: input.projectName,
      projectId: input.projectId,
      siteUrl: getSiteUrl(),
    }),
    tags: [{ name: "type", value: "project_handover" }],
  });
}

export async function sendProjectHandoverMail(input: SendProjectHandoverInput): Promise<void> {
  const result = await deliverProjectHandoverMail(input);
  await recordMailResult({ kind: "project_handover", input }, result);
}

/** Informiert die neue Projektleitung, ohne die Antwort aufzuhalten. */
export function notifyProjectHandover(handover: ProjectHandover): void {
  const to = handover.to;
  if (!to) return;
  sendInBackground("project_handover", () =>
    sendProjectHandoverMail({
      to,
      fullName: handover.fullName,
      projectName: handover.title,
      projectId: handover.projectId,
    }),
  );
}
