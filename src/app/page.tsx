import { Suspense } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandName } from "@/components/BrandName";
import { Navbar } from "@/components/Navbar";
import { CheckoutCancelToast } from "@/components/CheckoutCancelToast";
import { ProjectCard, type ProjectCardData } from "@/components/ProjectCard";
import { Button } from "@/components/ui/button";
import { deleteProjectAction } from "@/app/projektuebersicht/[project_id]/actions";
import { DEFAULT_COLOR_ID } from "@/lib/cover-colors";
import { DEFAULT_THEME_ID } from "@/lib/cover-themes";
import type { CoverData, CoverRowRaw } from "@/lib/cover-types";
import { formatLastEdited, projectCardAccess } from "@/lib/projects/project-card-status";

function IconPlus({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

function BuyMoreLink() {
  return (
    <Button
      asChild
      className="h-auto min-h-[3.25rem] w-full shrink-0 whitespace-normal border-[#EFEBE5] bg-[#EFEBE5] px-5 py-2 text-lg font-bold leading-6 text-[#1F1C19] hover:border-[#E4DFD8] hover:bg-[#E4DFD8] sm:w-auto"
    >
      <Link href="/onboarding">
        <IconPlus className="shrink-0" />
        Weiteren Projektzugang kaufen
      </Link>
    </Button>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  const { data: memberships } = await supabase
    .from("project_members")
    .select("role, projects(id, title, updated_at, chapters(id, updated_at))")
    .eq("user_id", user.id)
    .order("updated_at", { referencedTable: "projects", ascending: false });

  // PROJ-10: Cover-Daten als Batch (kein N+1). Wir lesen project_covers
  // für alle Projekte des Users in einer Query und mappen sie pro ID.
  const projectIds = (memberships ?? [])
    .map((m) => m.projects?.id)
    .filter((id): id is string => typeof id === "string");

  const { data: coverRows } =
    projectIds.length > 0
      ? await supabase
          .from("project_covers")
          .select("project_id, image_url, theme, metadata")
          .in("project_id", projectIds)
      : { data: [] as { project_id: string; image_url: string | null; theme: string | null; metadata: CoverRowRaw["metadata"] | null }[] };

  // PROJ-22: Ablaufdaten aller Projekte in einer Abfrage. Schlägt sie fehl,
  // zeigen die Karten neutral „Öffnen" und die Projektseite prüft selbst.
  const { data: accessRows, error: accessError } =
    projectIds.length > 0
      ? await supabase
          .from("project_access")
          .select("project_id, expires_at")
          .in("project_id", projectIds)
      : { data: [] as { project_id: string; expires_at: string | null }[], error: null };
  const expiresAtByProject = new Map(
    (accessRows ?? []).map((row) => [row.project_id, row.expires_at]),
  );

  const coverMap = new Map<string, CoverRowRaw>();
  for (const r of coverRows ?? []) {
    coverMap.set(r.project_id, {
      image_url: r.image_url,
      theme: r.theme,
      metadata: (r.metadata as CoverRowRaw["metadata"]) ?? null,
    });
  }

  // Signed URLs für Cover-Fotos parallel erzeugen — eine Promise pro
  // Projekt mit Foto, danach in eine Map<projectId, signedUrl>.
  const photoEntries = Array.from(coverMap.entries()).filter(
    ([, r]) => r.image_url,
  );
  const signedUrlPairs = await Promise.all(
    photoEntries.map(async ([pid, r]) => {
      const { data: signed } = await supabase.storage
        .from("project-covers")
        .createSignedUrl(r.image_url as string, 60 * 60);
      return [pid, signed?.signedUrl ?? null] as const;
    }),
  );
  const signedUrlMap = new Map<string, string | null>(signedUrlPairs);

  const projects: ProjectCardData[] = (memberships ?? [])
    .filter((m) => m.projects !== null)
    .map((m) => {
      const p = m.projects!;
      const chapters = Array.isArray(p.chapters) ? p.chapters : [];
      // „Zuletzt bearbeitet" ist das jüngste Update über Projekt UND alle
      // Kapitel — sonst bleibt die Anzeige stehen, sobald nur Kapitel-
      // Inhalt (Body, Title, Bilder) geändert wurde, denn dort wird
      // chapters.updated_at gebumpt, projects.updated_at hingegen nicht.
      let lastEdited = p.updated_at;
      for (const c of chapters) {
        if (c.updated_at && c.updated_at > lastEdited) lastEdited = c.updated_at;
      }
      const cover = coverMap.get(p.id) ?? null;
      const coverData: CoverData = {
        title: p.title,
        subtitle: cover?.metadata?.subtitle ?? "",
        authorLine: cover?.metadata?.author_line ?? "",
        themeId: cover?.theme ?? DEFAULT_THEME_ID,
        colorId: cover?.metadata?.background_color ?? DEFAULT_COLOR_ID,
        imageUrl: signedUrlMap.get(p.id) ?? null,
      };
      return {
        id: p.id,
        title: p.title,
        formattedUpdatedAt: formatLastEdited(lastEdited),
        lastEditedAt: lastEdited,
        chapterCount: chapters.length,
        userRole: m.role as "projektleiter" | "co_author",
        coverData,
        access: projectCardAccess(expiresAtByProject.get(p.id), accessError !== null),
      };
    })
    // Sort by effective last-edited (Projekt + Kapitel kombiniert), nicht
    // nur projects.updated_at — sonst rückt ein Projekt nicht nach oben,
    // wenn nur Kapitel-Inhalt geändert wurde.
    .sort((a, b) => (b.lastEditedAt > a.lastEditedAt ? 1 : -1));

  const singleProject = projects.length === 1;

  return (
    <>
      <Suspense fallback={null}>
        <CheckoutCancelToast />
      </Suspense>
      <Navbar />
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] pt-[7.348rem] xl:pl-[11rem] xl:pt-0">
        <section
          className={`relative isolate flex items-center justify-center overflow-hidden bg-[#4A453F] px-4 text-center sm:px-6 ${
            singleProject
              ? "min-h-[320px] pb-[6.5rem] pt-10 md:min-h-[360px]"
              : "min-h-[260px] py-10 md:min-h-[300px]"
          }`}
        >
          <div className="absolute -inset-6 -z-20">
            <Image
              src="/images/onboarding-background-book.png"
              alt=""
              fill
              className="object-cover blur-[7px] [object-position:center_42%]"
              sizes="(min-width: 1280px) calc(100vw - 11rem), 100vw"
              priority
            />
          </div>
          <div className="absolute inset-0 -z-10 bg-[#2B2722]/60" />
          <div className="flex max-w-5xl flex-col items-center gap-3.5">
            <h1 className="text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1.12] text-white">
              Willkommen zurück bei <BrandName />
            </h1>
            <p className="max-w-3xl text-xl leading-normal text-white sm:text-[1.375rem]">
              Schön, dass Sie sich die Zeit nehmen, um weitere Geschichten festzuhalten.
            </p>
          </div>
        </section>

        <div
          className={`relative mx-auto flex w-full flex-col gap-6 px-4 pb-16 sm:px-6 md:px-8 ${
            singleProject ? "-mt-[4.25rem] max-w-[1144px] sm:gap-7" : "max-w-[1312px] pt-10"
          }`}
        >
          {singleProject ? (
            <>
              <ProjectCard
                project={projects[0]!}
                deleteProjectAction={deleteProjectAction}
                featured
              />
              <section className="flex flex-col gap-4 border border-[#E0DCD5] bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-[1.625rem] leading-tight text-[#3E3831]">
                    Ein weiteres Buch beginnen
                  </h2>
                  <p className="text-lg leading-normal text-[#5F5A54]">
                    Zum Beispiel als Geschenk für einen Menschen, dessen Geschichte bleiben soll.
                  </p>
                </div>
                <BuyMoreLink />
              </section>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-[2rem] leading-[1.2] text-[#3E3831] sm:text-4xl">
                  Ihre Bücher
                </h2>
                <BuyMoreLink />
              </div>

              {projects.length === 0 ? (
                <div className="flex flex-col items-center gap-5 border border-[#E0DCD5] bg-white px-6 py-12 text-center sm:px-8 sm:py-14">
                  <p className="max-w-2xl text-lg leading-8 text-[#5F5A54] sm:text-xl sm:leading-9">
                    Sie haben noch kein Projekt. Kaufen Sie Ihren ersten Projektzugang, um loszulegen.
                  </p>
                  <Button asChild className="h-12 px-6 text-lg font-bold">
                    <Link href="/onboarding">Jetzt starten</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} deleteProjectAction={deleteProjectAction} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
