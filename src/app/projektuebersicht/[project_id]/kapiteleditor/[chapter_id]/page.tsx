import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import Link from "next/link";

export default async function KapiteleditorPage({
  params,
}: {
  params: Promise<{ project_id: string; chapter_id: string }>;
}) {
  const { project_id, chapter_id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  // Verify chapter exists and user is a member of the project
  const [{ data: chapter }, { data: membership }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, project_id")
      .eq("id", chapter_id)
      .eq("project_id", project_id)
      .single(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!chapter || !membership) notFound();

  return (
    <>
      <Navbar />
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-16 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 xl:pl-44 xl:pt-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <Link
              href={`/projektuebersicht/${project_id}`}
              className="inline-flex w-fit flex-row items-center gap-2 text-sm leading-5 text-black hover:underline sm:text-base"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" />
              </svg>
              Zurück zur Projektübersicht
            </Link>
            <h1 className="[font-family:var(--font-merriweather)] mt-1 text-2xl font-medium leading-8 text-[#3E3831] sm:text-3xl">
              {chapter.title}
            </h1>
          </header>

          <div className="flex flex-col items-center gap-4 bg-white p-8 text-center sm:p-12">
            <p className="text-base leading-7 text-[#848484]">
              Der A5-Kapitel-Editor (TipTap) wird mit{" "}
              <strong className="text-[#3E3831]">PROJ-5</strong> implementiert.
            </p>
            <p className="text-sm leading-6 text-[#848484]">
              Kapitel-ID: <code className="font-mono text-xs text-[#535252]">{chapter_id}</code>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
