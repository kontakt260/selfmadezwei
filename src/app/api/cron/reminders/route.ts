import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { maybeSendReminderMail } from "@/lib/email/send-reminder";
import { getSiteUrl } from "@/lib/email/client";

// PROJ-11 — Reminder-Cron.
//
// Trigger: Vercel-Cron schedule in vercel.json — täglich.
//
// Logik:
//   1. CRON_SECRET-Check (Header `x-cron-secret` oder Vercel-Default
//      `authorization: Bearer <secret>`).
//   2. Selektiert project_access mit expires_at in [now+29d..now+30d]
//      (reminder_30) und [now+6d..now+7d] (reminder_7).
//   3. Pro Match: PL des Projekts auflösen, mail_log-Reservierung
//      versuchen, bei Erfolg Reminder versenden.
//
// Antwort: JSON mit `processed`, `sent`, `skipped` für Monitoring.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ReminderTask = {
  variant: "30" | "7";
  windowStart: number;
  windowEnd: number;
};

function buildWindows(now: number): ReminderTask[] {
  return [
    {
      variant: "30",
      windowStart: now + 29 * ONE_DAY_MS,
      windowEnd: now + 30 * ONE_DAY_MS,
    },
    {
      variant: "7",
      windowStart: now + 6 * ONE_DAY_MS,
      windowEnd: now + 7 * ONE_DAY_MS,
    },
  ];
}

function formatGermanDate(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, reason: "CRON_SECRET not configured" };
  }

  // Vercel-Cron sendet `authorization: Bearer <CRON_SECRET>` automatisch,
  // wenn das Env-Var im Project gesetzt ist. Wir akzeptieren das + einen
  // zusätzlichen `x-cron-secret` Header (für manuelle Tests).
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return { ok: true };

  const header = req.headers.get("x-cron-secret");
  if (header === secret) return { ok: true };

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

  const supabase = createServiceRoleClient();
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
      .lt("expires_at", endISO);

    if (accessErr) {
      console.error(
        `[cron/reminders/${task.variant}] project_access query failed: ${accessErr.message}`,
      );
      continue;
    }

    for (const row of accessRows ?? []) {
      processed += 1;
      if (!row.expires_at) continue;

      // 2. PL des Projekts auflösen (es kann mehrere PL geben — wir
      //    schicken an alle).
      const { data: pls } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", row.project_id)
        .eq("role", "projektleiter");

      if (!pls || pls.length === 0) continue;

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

      for (const pl of pls) {
        // 5. Empfänger-Adresse + Name auflösen.
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", pl.user_id)
          .maybeSingle();
        if (!profile?.email) {
          skipped += 1;
          continue;
        }

        const r = await maybeSendReminderMail({
          to: profile.email,
          userId: pl.user_id,
          projectId: row.project_id,
          variant: task.variant,
          fullName: profile.full_name ?? undefined,
          projectName: projectRow.title,
          expiresAtFormatted: formatGermanDate(row.expires_at),
          renewUrl,
        });

        if (r.sent) sent += 1;
        else skipped += 1;
      }
    }
  }

  return NextResponse.json({ processed, sent, skipped });
}
