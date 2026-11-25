import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { assertLoaded, isUuid } from "@/lib/supabase/page-data";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ChapterListSection } from "@/components/projektuebersicht/ChapterListSection";
import { PaywallStats } from "@/components/projektuebersicht/PaywallStats";
import { daysUntil } from "@/lib/dates";
import { formatGermanDate } from "@/lib/email/format";
import { accessResultIsReadOnly } from "@/lib/projects/project-access";
import { getRetentionHoldUntil } from "@/lib/projects/trash";
import { ProjectUsersSection } from "@/components/projektuebersicht/ProjectUsersSection";
import type { MemberDisplay } from "@/components/projektuebersicht/ProjectUsersClient";
import { CheckoutCancelToast } from "@/components/CheckoutCancelToast";
import { BookView } from "@/components/cover/BookView";
import { PrintOrderCard } from "@/components/projektuebersicht/PrintOrderCard";
import { Button } from "@/components/ui/button";
import { DEFAULT_COLOR_ID } from "@/lib/cover-colors";
import { DEFAULT_THEME_ID } from "@/lib/cover-themes";
import type { CoverData, CoverRowRaw } from "@/lib/cover-types";
import { type Chapter, countWordsFromBody } from "@/lib/projektuebersicht-chapters";
import { bookFontOrDefault, pageCountIsCurrent } from "@/lib/book-fonts";
import { PageCountRefresh } from "@/components/projektuebersicht/PageCountRefresh";
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

// ─── Layout helpers ───────────────────────────────────────────────────────────

function SectionShell({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border border-[#E0DCD5] bg-white p-5 sm:gap-6 sm:p-8">
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
  if (!isUuid(project_id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  // PROJ-30: Alles, was nicht voneinander abhängt, läuft gleichzeitig. RLS
  // filtert jede Abfrage selbst, ausgegeben wird erst nach der Mitgliedsprüfung.
  // PROJ-6: expires_at liegt in `project_access`, nur der Stripe-Webhook schreibt.
  // PROJ-8: Der Impuls-Katalog kommt mit, damit das Modal ohne Roundtrip öffnet.
  const [
    projectResult,
    membershipResult,
    accessResult,
    coverResult,
    paymentsResult,
    chaptersResult,
    impulsesResult,
    membersResult,
  ] = await Promise.all([
    supabase.from("projects").select("id, title, book_font").eq("id", project_id).maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("project_access")
      .select("expires_at")
      .eq("project_id", project_id)
      .maybeSingle(),
    supabase
      .from("project_covers")
      .select("image_url, theme, metadata")
      .eq("project_id", project_id)
      .maybeSingle(),
    // Ablaufdatum nur anzeigen, wenn der Zugang wirklich bezahlt wurde.
    supabase
      .from("payments")
      .select("type, status")
      .eq("project_id", project_id)
      .eq("status", "completed")
      .eq("type", "initial_portal_access")
      .limit(1),
    // PROJ-30: Ohne `body`, die Wortzahl ist gespeichert.
    supabase
      .from("chapters")
      .select("id, title, chapter_origin, word_count, sort_order, page_count, page_count_font")
      .eq("project_id", project_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("impulse_catalog")
      .select("id, title, category, leading_questions")
      .order("sort_order", { ascending: true }),
    supabase
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", project_id)
      .order("created_at", { ascending: true }),
  ]);

  assertLoaded(projectResult, membershipResult, coverResult, chaptersResult, membersResult);
  const project = projectResult.data;
  // project not found OR user is not a member → 404 (avoids leaking project existence)
  if (!project || !membershipResult.data) notFound();
  const membership = membershipResult.data;
  const accessRow = accessResult.data;
  const coverRow = coverResult.data;
  const rawChapters = chaptersResult.data ?? [];
  const rawMembers = membersResult.data ?? [];

  // PROJ-28: Der Lesemodus hängt am echten Ablaufdatum, nicht am Erstkauf.
  const readOnly = accessResultIsReadOnly(accessResult);
  const expiredOn =
    readOnly && accessRow?.expires_at ? formatGermanDate(accessRow.expires_at) : null;

  // Zweite Runde: alles, was die Ergebnisse der ersten braucht.
  const uncountedIds = rawChapters.filter((c) => c.word_count === null).map((c) => c.id);
  const [signedCover, profilesResult, holdUntil, uncountedResult] = await Promise.all([
    coverRow?.image_url
      ? supabase.storage.from("project-covers").createSignedUrl(coverRow.image_url, 60 * 60)
      : null,
    rawMembers.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in(
            "id",
            rawMembers.map((m) => m.user_id),
          )
      : null,
    // Nach einer Rettung durch den Support gilt die Schonfrist statt der 90 Tage.
    expiredOn ? getRetentionHoldUntil(project_id) : null,
    // PROJ-30: Nur Kapitel ohne gespeicherte Zahl werden noch live gezählt.
    uncountedIds.length > 0
      ? supabase.from("chapters").select("id, body").in("id", uncountedIds).not("body", "is", null)
      : null,
  ]);
  assertLoaded(profilesResult, uncountedResult);

  // PROJ-10: Cover-Daten in CoverData übersetzen.
  const coverRaw: CoverRowRaw | null = coverRow
    ? {
        image_url: coverRow.image_url,
        theme: coverRow.theme,
        metadata: (coverRow.metadata as CoverRowRaw["metadata"]) ?? null,
      }
    : null;
  const coverData: CoverData = {
    title: project.title,
    subtitle: coverRaw?.metadata?.subtitle ?? "",
    authorLine: coverRaw?.metadata?.author_line ?? "",
    themeId: coverRaw?.theme ?? DEFAULT_THEME_ID,
    colorId: coverRaw?.metadata?.background_color ?? DEFAULT_COLOR_ID,
    imageUrl: signedCover?.data?.signedUrl ?? null,
    // PROJ-32: Das Cover steht in der Buchschrift.
    bookFont: bookFontOrDefault(project.book_font),
  };

  const hasInitialPayment = (paymentsResult.data ?? []).length > 0;
  const portalExpiresAt = hasInitialPayment ? accessRow?.expires_at ?? null : null;
  // Restlaufzeit serverseitig berechnen: die Client-Karte liest keine Uhr
  // (sonst Hydration-Abweichung, wenn Server und Client um Mitternacht
  // unterschiedliche Tage sehen).
  const portalDaysLeft = portalExpiresAt === null ? null : daysUntil(portalExpiresAt);
  const deletesOn = holdUntil ? formatGermanDate(holdUntil) : null;

  const liveWordCounts = new Map(
    (uncountedResult?.data ?? []).map((row) => [row.id, countWordsFromBody(row.body)]),
  );
  const chapters: Chapter[] = rawChapters.map((c) => ({
    id: c.id,
    title: c.title,
    source: c.chapter_origin === "catalog_impulse" ? "Erzähl-Impuls" : "Eigenes Kapitel",
    words: c.word_count ?? liveWordCounts.get(c.id) ?? 0,
  }));
  // PROJ-22: Kennzahlen für Cover-Karte und Druck-Karte.
  const chapterCount = chapters.length;
  const pageCount = rawChapters.reduce((sum, c) => sum + c.page_count, 0);
  // PROJ-32: Kapitel, deren Seitenzahl mit einer anderen Schrift gemessen wurde.
  const bookFont = bookFontOrDefault(project.book_font);
  const staleCount = rawChapters.filter((c) => !pageCountIsCurrent(c.page_count_font, bookFont)).length;
  const openChapterCount = chapters.filter((c) => c.words === 0).length;
  const bookSummary =
    chapterCount === 0
      ? "Noch keine Kapitel"
      : `${chapterCount} Kapitel, ${pageCount === 1 ? "1 Seite" : `${pageCount} Seiten`} im A5-Format`;

  const impulses = (impulsesResult.data ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    leading_questions: i.leading_questions ?? [],
  }));

  // PROJ-9: RLS lässt nur Mitglieder ihres eigenen Projekts sehen.
  const profileMap = new Map(
    (profilesResult?.data ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]),
  );
  const members: MemberDisplay[] = rawMembers.map((m) => {
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

  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
        <CheckoutCancelToast />
      </Suspense>
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-20 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pb-16 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12">
        <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-6 sm:gap-8">
          <Link
            href="/"
            className="inline-flex min-h-11 w-fit max-w-full flex-row items-center gap-2 text-base leading-6 text-[#3E3831] hover:underline sm:text-lg sm:leading-7"
          >
            <IconArrowLeft />
            Zurück zur Startseite
          </Link>

          {/* Cover-Karte */}
          <section className="flex flex-col border border-[#E0DCD5] bg-white lg:flex-row">
            <div className="flex items-center justify-center bg-[#EFEAE3] px-6 py-10 sm:px-10 sm:py-14 lg:flex-1">
              <BookView data={coverData} className="max-w-[392px]" />
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-6 p-6 sm:p-10 lg:flex-1 lg:p-14">
              <div className="flex min-w-0 flex-col gap-2.5">
                <h1 className="text-[clamp(2.375rem,3.6vw,3.375rem)] leading-[1.12] text-[#3E3831] [overflow-wrap:anywhere]">
                  {project.title}
                </h1>
                {coverData.authorLine.trim() ? (
                  <p className="text-xl leading-snug text-[#4A453F] [overflow-wrap:anywhere] sm:text-[1.375rem]">
                    {coverData.authorLine}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-lg leading-relaxed text-[#4A453F] sm:text-xl">{bookSummary}</p>
                <PageCountRefresh projectId={project_id} staleCount={staleCount} readOnly={readOnly} />
              </div>
              <Button asChild className="h-[3.625rem] w-full px-8 text-xl font-bold sm:w-fit">
                <Link href={`/projektuebersicht/${project_id}/cover-bearbeiten`}>
                  {readOnly ? "Cover ansehen" : "Cover bearbeiten"}
                </Link>
              </Button>
            </div>
          </section>

          {/* Kapitel */}
          <SectionShell>
            <ChapterListSection
              projectId={project_id}
              initialChapters={chapters}
              readOnly={readOnly}
              impulses={impulses}
              addChapterAction={addChapterAction}
              addImpulseChapterAction={addImpulseChapterAction}
              renameChapterAction={renameChapterAction}
              deleteChapterAction={deleteChapterAction}
              saveChapterOrderAction={saveChapterOrderAction}
            />
          </SectionShell>

          {/* PROJ-22: Platzhalter bis PROJ-16, bewusst ohne Lesemodus-Sperre */}
          <PrintOrderCard
            title={project.title}
            chapterCount={chapterCount}
            pageCount={pageCount}
            openChapterCount={openChapterCount}
            hasCover={coverRow !== null}
          />

          <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
            <SectionShell>
              <SectionHeader icon={<IconPhoneHandset />} title="Erzählen per Sprachnachricht" />
              <p className="text-base leading-7 text-[#5F5A54] sm:text-lg sm:leading-8">
                Das Erzählen per Sprachnachricht wird mit der Audio-Erzählpipeline aktiviert (PROJ-12).
              </p>
            </SectionShell>

            {/* Stat-Karte mit Verlängerungs-Button (PROJ-6) */}
            <PaywallStats
              projectId={project_id}
              portalExpiresAt={portalExpiresAt}
              daysLeft={portalDaysLeft}
              expiredOn={expiredOn}
              deletesOn={deletesOn}
            />
          </div>

          {/* PROJ-9: Mitgliederverwaltung */}
          <ProjectUsersSection
            projectId={project_id}
            members={members}
            myRole={membership.role}
            readOnly={readOnly}
          />

        </div>
      </main>
    </>
  );
}
