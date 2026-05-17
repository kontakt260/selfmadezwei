import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ChapterListSection } from "@/components/projektuebersicht/ChapterListSection";
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

function IconClock() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke="#96B897" strokeWidth={2} />
      <path d="M12 7v5l3 2" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={5} width={18} height={16} stroke="#96B897" strokeWidth={2} />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="#96B897" strokeWidth={2} strokeLinecap="square" />
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

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-3 bg-white p-5 sm:p-8">
      <div className="flex flex-row items-center gap-2 sm:gap-3">
        <span className="shrink-0 [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-7 sm:[&>svg]:w-7">{icon}</span>
        <h3 className="[font-family:var(--font-pt-serif)] min-w-0 text-xl leading-8 text-[#3E3831] sm:text-2xl sm:leading-9">
          {label}
        </h3>
      </div>
      <p className="text-3xl leading-9 text-[#3E3831] sm:text-4xl sm:leading-10">{value}</p>
      <p className="text-sm leading-6 text-[#848484] sm:text-base">{hint}</p>
    </div>
  );
}

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

  // Fetch project + user membership in one go
  const [{ data: project }, { data: membership }] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", project_id).single(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .single(),
  ]);

  // project not found OR user is not a member → 404 (avoids leaking project existence)
  if (!project || !membership) notFound();

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

  return (
    <>
      <Navbar />
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
              addChapterAction={addChapterAction}
              addImpulseChapterAction={addImpulseChapterAction}
              renameChapterAction={renameChapterAction}
              deleteChapterAction={deleteChapterAction}
              saveChapterOrderAction={saveChapterOrderAction}
            />
          </SectionShell>

          {/* Stat cards (placeholders) */}
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <StatCard
              icon={<IconClock />}
              label="Telefonzeit übrig"
              value="—"
              hint="Verfügbar nach Aktivierung des Telefon-Assistenten (PROJ-12)"
            />
            <StatCard
              icon={<IconCalendar />}
              label="NARRAVIT-Projektzugang endet in"
              value="—"
              hint="Wird nach abgeschlossener Zahlung angezeigt (PROJ-6)"
            />
          </div>

          {/* Projektmitglieder placeholder */}
          <SectionShell>
            <SectionHeader icon={<IconUsers />} title="Projektmitglieder" />
            <p className="text-base leading-7 text-[#848484] sm:text-lg sm:leading-8">
              Die Mitgliederverwaltung wird mit PROJ-9 aktiviert.
            </p>
          </SectionShell>

        </div>
      </main>
    </>
  );
}
