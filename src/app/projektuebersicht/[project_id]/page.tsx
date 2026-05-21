import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ChapterListSection } from "@/components/projektuebersicht/ChapterListSection";
import { PaywallStats } from "@/components/projektuebersicht/PaywallStats";
import { ProjectUsersSection } from "@/components/projektuebersicht/ProjectUsersSection";
import type { MemberDisplay } from "@/components/projektuebersicht/ProjectUsersClient";
import { CheckoutCancelToast } from "@/components/CheckoutCancelToast";
import { type Chapter, countWordsFromBody } from "@/lib/projektuebersicht-chapters";
import {
  addChapterAction,
  addImpulseChapterAction,
  renameChapterAction,
  deleteChapterAction,
  saveChapterOrderAction,
} from "./actions";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconArrowLeft() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="#96B897" strokeWidth={2} />
      <circle cx={12} cy={12} r={3} stroke="#96B897" strokeWidth={2} />
    </svg>
  );
}

function IconPhoneHandset() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="#96B897"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={9} cy={8} r={4} stroke="#96B897" strokeWidth={2} />
      <path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6M17 11a4 4 0 0 0 0-8M22 21c0-3-2-5-5-5.5" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function SectionShell({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 bg-white p-5 sm:gap-6 sm:p-8">
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex min-w-0 flex-row items-center gap-2 sm:gap-3">
        <span className="shrink-0 [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
        <h2 className="[font-family:var(--font-pt-serif)] min-w-0 text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
          {title}
        </h2>
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 lg:w-auto lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

// StatCard ist in src/components/projektuebersicht/PaywallStats.tsx
// gekapselt — die ursprüngliche Inline-Variante wurde durch das neue
// `<PaywallStats>`-Compound ersetzt (PROJ-6 Frontend-Phase).

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProjektuebersichtPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  // Fetch project + user membership + paywall-state in one go.
  // PROJ-6: expires_at liegt jetzt in `project_access` (RLS-SELECT-Policy
  // erlaubt nur Mitgliedern den Lesezugriff — kein client-seitiges
  // UPDATE möglich, nur der Stripe-Webhook über service_role schreibt).
  const [{ data: project }, { data: membership }, { data: accessRow }] =
    await Promise.all([
      supabase.from("projects").select("id, title").eq("id", project_id).single(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", project_id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("project_access")
        .select("expires_at")
        .eq("project_id", project_id)
        .maybeSingle(),
    ]);

  // project not found OR user is not a member → 404 (avoids leaking project existence)
  if (!project || !membership) notFound();

  // Vapi-Sprechzeit-Berechnung (PROJ-6):
  //   36 000 s (10 h Inklusiv) + Σ vapi-Top-Ups × 3 600 − Σ voice-sessions.duration
  // Sichtbarkeit: project_access.expires_at ist der Truth-Anker für
  // aktiven Zugang (Stripe-Webhook setzt ihn, Bestandsdaten haben ihn
  // ebenfalls). Vorher prüften wir auf einen erfolgreichen
  // initial_portal_access-Payment — das schloss Bestandsprojekte (vor
  // PROJ-6 angelegt) aus, weil sie keinen Stripe-Payment-Eintrag haben.
  const [{ data: payments }, { data: voiceSessions }] = await Promise.all([
    supabase
      .from("payments")
      .select("type, status")
      .eq("project_id", project_id)
      .eq("status", "completed"),
    supabase
      .from("voice_sessions")
      .select("duration_seconds")
      .eq("project_id", project_id),
  ]);
  const hasActiveAccess = !!accessRow?.expires_at;
  const vapiTopUps = (payments ?? []).filter(
    (p) => p.type === "vapi_voice_minutes_60",
  ).length;
  const consumedSeconds = (voiceSessions ?? []).reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0,
  );
  const vapiSecondsAvailable = hasActiveAccess
    ? Math.max(0, 36_000 + vapiTopUps * 3_600 - consumedSeconds)
    : null;
  const portalExpiresAt = hasActiveAccess ? accessRow?.expires_at ?? null : null;

  const { data: rawChapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_origin, body, sort_order")
    .eq("project_id", project_id)
    .order("sort_order", { ascending: true });

  const chapters: Chapter[] = (rawChapters ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    source: c.chapter_origin === "catalog_impulse" ? "Erzähl-Impuls" : "Eigenes Kapitel",
    words: countWordsFromBody(c.body),
  }));

  // PROJ-8: Erzähl-Impuls-Katalog für das Shuffle-Modal. RLS erlaubt
  // SELECT für authenticated; jeder Nutzer sieht den vollständigen Katalog.
  // Wir reichen den Katalog als Prop an die Client-Komponente — kein
  // Roundtrip beim Öffnen des Modals.
  const { data: rawImpulses } = await supabase
    .from("impulse_catalog")
    .select("id, title, category, leading_questions")
    .order("sort_order", { ascending: true });

  const impulses = (rawImpulses ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    leading_questions: i.leading_questions ?? [],
  }));

  // PROJ-9: Mitglieder + Profile parallel laden. RLS lässt nur Mitglieder
  // ihres eigenen Projekts sehen — kein zusätzlicher Filter nötig.
  const { data: rawMembers } = await supabase
    .from("project_members")
    .select("id, user_id, role")
    .eq("project_id", project_id)
    .order("created_at", { ascending: true });

  let members: MemberDisplay[] = [];
  if (rawMembers && rawMembers.length > 0) {
    const memberUserIds = rawMembers.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", memberUserIds);
    const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
    (profiles ?? []).forEach((p) => {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    });
    members = rawMembers.map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        memberId: m.id,
        userId: m.user_id,
        fullName: p?.full_name ?? "",
        email: p?.email ?? "",
        role: m.role,
        isMe: m.user_id === user.id,
      };
    });
  }

  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
        <CheckoutCancelToast />
      </Suspense>
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-20 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pb-16 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12">
        <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">

          {/* Header */}
          <header className="flex flex-col gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex w-fit max-w-full flex-row items-center gap-2 text-base leading-6 text-black hover:underline sm:text-lg sm:leading-7"
            >
              <IconArrowLeft />
              Zurück zur Startseite
            </Link>
            <h1 className="[font-family:var(--font-merriweather)] mt-1 text-3xl font-medium leading-10 text-[#3E3831] sm:mt-2 sm:text-4xl sm:leading-[1.2] md:text-5xl">
              {project.title}
            </h1>
            <p className="text-lg leading-8 text-[#535252] sm:text-xl sm:leading-9">
              Projekt bearbeiten und verwalten
            </p>
          </header>

          {/* Cover + Code placeholder */}
          <SectionShell>
            <div className="flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
              <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
                <SectionHeader icon={<IconEye />} title="Cover bearbeiten" />
                <div className="flex flex-col gap-4 bg-[#FAF8F6] p-5 sm:p-7">
                  <p className="text-base leading-7 text-[#848484] sm:text-lg sm:leading-8">
                    Der Cover-Editor ist in Kürze verfügbar (PROJ-10).
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
                <SectionHeader icon={<IconPhoneHandset />} title="Code für das Telefonieren" />
                <div className="flex flex-col gap-4 bg-[#FAF8F6] p-5 sm:p-7">
                  <p className="text-base leading-7 text-[#848484] sm:text-lg sm:leading-8">
                    Der Telefon-Code wird mit dem Vapi-Modul aktiviert (PROJ-12).
                  </p>
                </div>
              </div>
            </div>
          </SectionShell>

          {/* Kapitel */}
          <SectionShell>
            <ChapterListSection
              projectId={project_id}
              initialChapters={chapters}
              impulses={impulses}
              addChapterAction={addChapterAction}
              addImpulseChapterAction={addImpulseChapterAction}
              renameChapterAction={renameChapterAction}
              deleteChapterAction={deleteChapterAction}
              saveChapterOrderAction={saveChapterOrderAction}
            />
          </SectionShell>

          {/* Stat cards mit Verlängerungs- und Vapi-Nachkauf-Buttons (PROJ-6) */}
          <PaywallStats
            projectId={project_id}
            portalExpiresAt={portalExpiresAt}
            vapiSecondsAvailable={vapiSecondsAvailable}
          />

          {/* PROJ-9: Mitgliederverwaltung */}
          <ProjectUsersSection
            projectId={project_id}
            members={members}
            myRole={membership.role}
          />

        </div>
      </main>
    </>
  );
}
