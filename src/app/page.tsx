import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ProjectCard, type ProjectCardData } from "@/components/ProjectCard";
import { deleteProjectAction } from "@/app/projektuebersicht/[project_id]/actions";

function IconPlus({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    </svg>
  );
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "Heute bearbeitet";
  if (diffDays === 1) return "Gestern bearbeitet";
  if (diffDays < 7) return `Vor ${diffDays} Tagen bearbeitet`;
  if (diffDays < 14) return "Vor 1 Woche bearbeitet";
  if (diffDays < 30) return `Vor ${Math.floor(diffDays / 7)} Wochen bearbeitet`;
  if (diffDays < 60) return "Vor 1 Monat bearbeitet";
  return `Vor ${Math.floor(diffDays / 30)} Monaten bearbeitet`;
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  const { data: memberships } = await supabase
    .from("project_members")
    .select("role, projects(id, title, updated_at, chapters(id))")
    .eq("user_id", user.id)
    .order("updated_at", { referencedTable: "projects", ascending: false });

  const projects: ProjectCardData[] = (memberships ?? [])
    .filter((m) => m.projects !== null)
    .map((m) => {
      const p = m.projects!;
      const chapters = Array.isArray(p.chapters) ? p.chapters : [];
      return {
        id: p.id,
        title: p.title,
        formattedUpdatedAt: formatRelativeDate(p.updated_at),
        chapterCount: chapters.length,
        userRole: m.role as "projektleiter" | "co_author",
      };
    });

  return (
    <>
      <Navbar />
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-16 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12">
        <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">
          <div className="relative h-[min(31.5vh,285px)] w-full min-h-[105px] overflow-hidden sm:min-h-[135px]">
            <Image
              src="/images/start-hero.png"
              alt="Nahaufnahme: Hände mit Stift über einem geöffneten, türkisfarbenen Notizbuch."
              fill
              className="object-cover blur-[2px]"
              sizes="(max-width: 768px) 100vw, 1213px"
              priority
            />
          </div>

          <header className="flex w-full flex-col items-center gap-2 text-center">
            <h1 className="[font-family:var(--font-merriweather)] w-full text-3xl font-medium leading-10 text-[#3E3831] sm:text-4xl sm:leading-[1.2] md:text-5xl">
              Willkommen zurück bei NARRAVIT
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-[#535252] sm:text-xl sm:leading-9">
              Schön, dass Sie sich die Zeit nehmen, um weitere Geschichten festzuhalten.
            </p>
          </header>

          <section className="flex flex-col gap-6 sm:gap-8">
            <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <h2 className="[font-family:var(--font-pt-serif)] text-2xl leading-8 text-[#3E3831] sm:text-3xl sm:leading-10">
                {projects.length === 1 ? "Ihr Projekt" : "Ihre Projekte"}
              </h2>
              <Link
                href="/onboarding"
                className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-3 bg-[rgba(10,9,9,0.05)] px-5 text-lg font-bold leading-6 text-black transition-colors hover:bg-[rgba(10,9,9,0.08)] sm:w-auto sm:min-w-[300px] sm:justify-start sm:pl-6"
              >
                <IconPlus className="shrink-0 text-black" />
                Weiteren Projekt-Zugang kaufen
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="flex flex-col items-center gap-5 bg-white px-6 py-12 text-center sm:px-8 sm:py-14">
                <p className="max-w-2xl text-lg leading-8 text-[#848484] sm:text-xl sm:leading-9">
                  Sie haben noch kein Projekt. Kaufen Sie Ihren ersten Portal-Zugang, um loszulegen.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex h-12 items-center justify-center bg-[#D0BCA6] px-6 text-lg font-bold text-[#0a0909] transition-colors hover:bg-[#c0ad98]"
                >
                  Jetzt starten
                </Link>
              </div>
            ) : (
              <div
                className={
                  projects.length === 1
                    ? "mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,min(100%,36rem))] justify-center gap-5 sm:gap-6 md:-translate-x-8 md:gap-6 xl:-translate-x-10 xl:gap-6"
                    : "mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,min(100%,32rem))] justify-center gap-5 sm:gap-6 md:grid-cols-[repeat(auto-fit,minmax(22rem,24rem))] md:gap-6 xl:grid-cols-[repeat(auto-fit,minmax(22rem,24rem))] xl:gap-6"
                }
              >
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} deleteProjectAction={deleteProjectAction} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
