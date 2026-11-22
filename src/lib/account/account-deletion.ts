import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/database.types";

// PROJ-3 — Konto löschen (Refine 2026-11-22).
//
// Die Regeln stehen in den Datenbank-Funktionen der Migration
// `20261122140000_proj3_account_deletion.sql`, damit Prüfung, Übergabe und
// Löschung in einer Transaktion laufen. Dieses Modul ruft sie auf und prüft
// ihre Antworten.

type ServiceClient = SupabaseClient<Database>;

const projectSchema = z.object({
  projectId: z.string(),
  title: z.string(),
});

const candidateSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  email: z.string(),
});

const overviewSchema = z.object({
  delete: z.array(projectSchema),
  keep: z.array(projectSchema.extend({ candidates: z.array(candidateSchema) })),
  otherCount: z.number().int().min(0),
});

const handoverSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  to: z.string().nullable(),
  fullName: z.string(),
});

const prepareResultSchema = z.object({
  deletedProjectIds: z.array(z.string()),
  handovers: z.array(handoverSchema.nullable()),
});

const leaveResultSchema = z.object({
  handover: handoverSchema.nullable(),
});

export type AccountDeletionOverview = z.infer<typeof overviewSchema>;
export type ProjectHandover = z.infer<typeof handoverSchema>;

export type PrepareAccountDeletionResult =
  | { status: "ok"; deletedProjectIds: string[]; handovers: ProjectHandover[] }
  /** Der Stand hat sich seit dem Öffnen des Dialogs geändert. Nichts wurde gelöscht. */
  | { status: "changed" }
  | { status: "failed" };

export type LeaveProjectResult =
  | { status: "ok"; handover: ProjectHandover | null }
  | { status: "not_member" | "last_member" | "successor_required" | "failed" };

const CHANGED_ERRORS = new Set(["overview_changed", "successor_required"]);
const LEAVE_ERRORS = new Set(["not_member", "last_member", "successor_required"]);

/** Was beim Löschen dieses Kontos mit seinen Projekten passieren würde. */
export async function loadAccountDeletionOverview(
  supabase: ServiceClient,
  user: { id: string; email?: string | null },
): Promise<AccountDeletionOverview | null> {
  const { data, error } = await supabase.rpc("account_deletion_overview", {
    p_user_id: user.id,
    p_email: user.email ?? "",
  });
  if (error) {
    console.error(`[account-deletion] overview failed: ${error.message}`);
    return null;
  }

  const parsed = overviewSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[account-deletion] overview has an unexpected shape");
    return null;
  }
  return parsed.data;
}

/**
 * Alles, was vor dem Löschen des Kontos passieren muss: Nachfolge setzen,
 * Eigentum übergeben, Einzelprojekte löschen, Kaufdaten bereinigen. Läuft in
 * einer Transaktion, bei einem Fehler bleibt alles unverändert.
 */
export async function prepareAccountDeletion(
  supabase: ServiceClient,
  input: {
    userId: string;
    email?: string | null;
    confirmedDelete: string[];
    successors: Record<string, string>;
  },
): Promise<PrepareAccountDeletionResult> {
  const { data, error } = await supabase.rpc("prepare_account_deletion", {
    p_user_id: input.userId,
    p_email: input.email ?? "",
    p_confirmed_delete: input.confirmedDelete,
    p_successors: input.successors as unknown as Json,
  });

  if (error) {
    if (CHANGED_ERRORS.has(error.message)) return { status: "changed" };
    console.error(`[account-deletion] prepare failed: ${error.message}`);
    return { status: "failed" };
  }

  // Die Transaktion ist hier schon abgeschlossen. Eine unerwartete Antwort darf
  // die Löschung nicht mehr aufhalten, die Dateien räumt der Cron auf.
  const parsed = prepareResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[account-deletion] prepare result has an unexpected shape");
    return { status: "ok", deletedProjectIds: [], handovers: [] };
  }
  return {
    status: "ok",
    deletedProjectIds: parsed.data.deletedProjectIds,
    handovers: parsed.data.handovers.filter((h): h is ProjectHandover => h !== null),
  };
}

/** Verlässt ein Projekt und übergibt bei Bedarf die Projektleitung. */
export async function leaveProject(
  supabase: ServiceClient,
  input: { projectId: string; userId: string; successorUserId?: string },
): Promise<LeaveProjectResult> {
  const { data, error } = await supabase.rpc("leave_project", {
    p_project_id: input.projectId,
    p_user_id: input.userId,
    p_successor_user_id: input.successorUserId ?? null,
  });

  if (error) {
    if (LEAVE_ERRORS.has(error.message)) {
      return { status: error.message as "not_member" | "last_member" | "successor_required" };
    }
    console.error(`[account-deletion] leave failed: ${error.message}`);
    return { status: "failed" };
  }

  const parsed = leaveResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[account-deletion] leave result has an unexpected shape");
    return { status: "ok", handover: null };
  }
  return { status: "ok", handover: parsed.data.handover };
}
