import "server-only";
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { maybeSendReminderMail } from "@/lib/email/send-reminder";
import { getSiteUrl } from "@/lib/email/client";
import { calendarDaysUntil, formatGermanDate } from "@/lib/email/format";
import { processMailRetryQueue, type MailRetryResult } from "@/lib/email/retry-mails";
import {
  processChapterStorageCleanup,
  processImageStorageCleanup,
  processStorageCleanup,
  type StorageCleanupResult,
} from "@/lib/projects/storage-cleanup";
import { moveExpiredProjectsToTrash, type RetentionResult } from "@/lib/projects/retention";
import { purgeDueTrash, type TrashPurgeResult } from "@/lib/projects/trash";
import { purgeExpiredNarrationDrafts } from "@/lib/purchases/narration-draft";

// PROJ-11 — Reminder-Cron.
//
// Trigger: Vercel-Cron schedule in vercel.json — täglich.
//
// Logik:
//   1. CRON_SECRET-Check (Header `x-cron-secret` oder Vercel-Default
//      `authorization: Bearer <secret>`).
//   2. Selektiert project_access mit expires_at in [now+7d..now+30d)
//      (reminder_30) und [now..now+7d) (reminder_7). Die Fenster sind
//      bewusst breiter als ein Tag: Fällt ein Lauf aus oder schlägt ein
//      Versand fehl, holt der nächste Lauf die Erinnerung nach. Doppelte
//      Mails verhindert der mail_log-Marker.
//   3. Pro Match: alle Mitglieder des Projekts auflösen (Projektleiter UND
//      Co-Autoren — verlängern kann jedes Mitglied, z. B. auch die
//      beschenkte Person; Jakob, 2026-11-19), mail_log-Reservierung pro
//      Person versuchen, bei Erfolg Reminder versenden.
//   4. Vorher: gescheiterte Kauf- und Einladungs-Mails nachholen (BUG-13)
//      und Dateien gelöschter Projekte aus dem Speicher entfernen (PROJ-3).
//      Fällige Inhalte aus dem Papierkorb werden davor endgültig gelöscht,
//      damit ihre Dateien im selben Lauf verschwinden (PROJ-26). Noch davor
//      kommen Projekte, die seit 90 Tagen abgelaufen sind, in den Papierkorb
//      (PROJ-28). Danach werden entfernte Fotos gelöscht, deren 14 Tage um
//      sind (PROJ-34).
//
// Antwort: JSON mit `processed`, `sent`, `skipped`, `mailRetries`,
// `retention`, `trashPurge`, `storageCleanup`, `chapterStorageCleanup`,
// `imageStorageCleanup` und `narrationDrafts` für Monitoring.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Obergrenze pro Lauf und Fenster — schützt die Laufzeit der Funktion. */
const MAX_ACCESS_ROWS = 500;

type ReminderTask = {
  variant: "30" | "7";
  windowStart: number;
  windowEnd: number;
};

function buildWindows(now: number): ReminderTask[] {
  return [
    {
      variant: "30",
      windowStart: now + 7 * ONE_DAY_MS,
      windowEnd: now + 30 * ONE_DAY_MS,
    },
    {
      variant: "7",
      windowStart: now,
      windowEnd: now + 7 * ONE_DAY_MS,
    },
  ];
}

/** Kalendertage bis zum Ablauf in deutscher Zeit, am letzten Tag 1 (BUG-15). */
function daysUntil(expiresAt: string, now: number): number {
  return Math.max(1, calendarDaysUntil(expiresAt, now));
}

/** Zeitkonstanter Vergleich, damit die Antwortzeit das Secret nicht verrät. */
function secretMatches(candidate: string | null, secret: string): boolean {
  if (candidate === null) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, reason: "CRON_SECRET not configured" };
  }

  // Vercel-Cron sendet `authorization: Bearer <CRON_SECRET>` automatisch,
  // wenn das Env-Var im Project gesetzt ist. Wir akzeptieren das + einen
  // zusätzlichen `x-cron-secret` Header (für manuelle Tests).
  if (secretMatches(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return { ok: true };
  }
  if (secretMatches(req.headers.get("x-cron-secret"), secret)) {
    return { ok: true };
  }

  return { ok: false, status: 401, reason: "Unauthorized" };
}

export async function GET(req: NextRequest) {
  const authResult = authorize(req);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.reason },
      { status: authResult.status },
    );
  }

  // Eigener Schritt: Ein Fehler hier darf die Erinnerungen nicht aufhalten.
  let mailRetries: MailRetryResult = { retried: 0, sent: 0, dropped: 0, gaveUp: 0 };
  try {
    mailRetries = await processMailRetryQueue();
  } catch (err) {
    console.error(
      `[cron/reminders] mail retry failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let retention: RetentionResult = { due: 0, moved: 0, skipped: 0, failed: 0, braked: false };
  try {
    retention = await moveExpiredProjectsToTrash();
  } catch (err) {
    console.error(
      `[cron/reminders] retention failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let trashPurge: TrashPurgeResult = { projects: 0, chapters: 0 };
  try {
    trashPurge = await purgeDueTrash();
  } catch (err) {
    console.error(
      `[cron/reminders] trash purge failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let storageCleanup: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  try {
    storageCleanup = await processStorageCleanup();
  } catch (err) {
    console.error(
      `[cron/reminders] storage cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let chapterStorageCleanup: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  try {
    chapterStorageCleanup = await processChapterStorageCleanup();
  } catch (err) {
    console.error(
      `[cron/reminders] chapter storage cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let imageStorageCleanup: StorageCleanupResult = { processed: 0, cleaned: 0, failed: 0 };
  try {
    imageStorageCleanup = await processImageStorageCleanup();
  } catch (err) {
    console.error(
      `[cron/reminders] image storage cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const supabase = createServiceRoleClient();

  // PROJ-24: Kontaktdaten aus nicht abgeschlossenen Käufen entfernen.
  let narrationDrafts = { removed: 0 };
  try {
    narrationDrafts = await purgeExpiredNarrationDrafts(supabase);
  } catch (err) {
    console.error(
      `[cron/reminders] narration draft cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const now = Date.now();
  const windows = buildWindows(now);
  const siteUrl = getSiteUrl();

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const task of windows) {
    const startISO = new Date(task.windowStart).toISOString();
    const endISO = new Date(task.windowEnd).toISOString();

    // 1. project_access mit Match-Fenster auswählen.
    const { data: accessRows, error: accessErr } = await supabase
      .from("project_access")
      .select("project_id, expires_at")
      .gte("expires_at", startISO)
      .lt("expires_at", endISO)
      .order("expires_at", { ascending: true })
      .limit(MAX_ACCESS_ROWS);

    if (accessErr) {
      console.error(
        `[cron/reminders/${task.variant}] project_access query failed: ${accessErr.message}`,
      );
      continue;
    }

    for (const row of accessRows ?? []) {
      processed += 1;
      if (!row.expires_at) continue;

      // 2. Alle Mitglieder des Projekts auflösen, unabhängig von der Rolle.
      const { data: members } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", row.project_id)
        .limit(50);

      if (!members || members.length === 0) continue;

      // 3. Projekt-Titel laden.
      const { data: projectRow } = await supabase
        .from("projects")
        .select("title")
        .eq("id", row.project_id)
        .maybeSingle();
      if (!projectRow) continue;

      // 4. Verlängerungs-URL — der Stripe-Checkout-Start für renewals
      //    läuft über /onboarding. Wir verlinken auf den persönlichen
      //    Bereich, von wo der User den Verlängern-Button findet.
      const renewUrl = `${siteUrl}/projektuebersicht/${row.project_id}`;

      for (const member of members) {
        // 5. Empfänger-Adresse + Name auflösen.
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", member.user_id)
          .maybeSingle();
        if (!profile?.email) {
          skipped += 1;
          continue;
        }

        const r = await maybeSendReminderMail({
          to: profile.email,
          userId: member.user_id,
          projectId: row.project_id,
          variant: task.variant,
          fullName: profile.full_name ?? undefined,
          projectName: projectRow.title,
          expiresAt: row.expires_at,
          expiresAtFormatted: formatGermanDate(row.expires_at),
          daysLeft: daysUntil(row.expires_at, now),
          renewUrl,
        });

        if (r.sent) sent += 1;
        else skipped += 1;
      }
    }
  }

  return NextResponse.json({
    processed,
    sent,
    skipped,
    mailRetries,
    retention,
    trashPurge,
    storageCleanup,
    chapterStorageCleanup,
    imageStorageCleanup,
    narrationDrafts,
  });
}
