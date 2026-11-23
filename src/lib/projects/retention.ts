import "server-only";
import { z } from "zod";
import { sendRetentionBrakeAlert } from "@/lib/email/send-retention-brake-alert";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// PROJ-28 — automatische Löschung nach dem Ablauf.
//
// 90 Tage nach dem Ablauf kommt ein Projekt in den Papierkorb aus PROJ-26,
// von dort löscht es der vorhandene Lauf nach 14 Tagen endgültig. Die Regeln
// (Fristen, Sperren, Bremse) liegen in der Datenbank. Sind zu viele Projekte
// fällig, bewegt der Lauf keines davon und der Support bekommt einen Hinweis
// (docs/production/support-papierkorb.md).

/** Muss zur Grenze in `retention_move_due` passen. */
export const RETENTION_MAX_PER_RUN = 50;

const count = z.number().int().min(0);

const retentionResultSchema = z.object({
  due: count,
  moved: count,
  skipped: count,
  failed: count,
  braked: z.boolean(),
});

export type RetentionResult = z.infer<typeof retentionResultSchema>;

/** Legt fällige Projekte in den Papierkorb. Kunden bekommen keine Mail. */
export async function moveExpiredProjectsToTrash(): Promise<RetentionResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("retention_move_due");
  if (error) throw new Error(error.message);

  const result = retentionResultSchema.parse(data);

  if (result.failed > 0) {
    console.error(`[retention] ${result.failed} project(s) could not be moved`);
  }
  if (result.braked) {
    console.error(`[retention] brake active: ${result.due} projects due, none moved`);
    await sendRetentionBrakeAlert({ due: result.due, limit: RETENTION_MAX_PER_RUN });
  }

  return result;
}
