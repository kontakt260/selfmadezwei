import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CoverEditorClient } from "@/components/cover/CoverEditorClient";
import { DEFAULT_COLOR_ID } from "@/lib/cover-colors";
import { DEFAULT_THEME_ID } from "@/lib/cover-themes";
import type { CoverData, CoverRowRaw } from "@/lib/cover-types";

function IconArrowLeft() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default async function CoverBearbeitenPage({
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

  // Projekt + Mitgliedschaft in einem Schwung — wenn Mitgliedschaft fehlt,
  // wird notFound() ausgelöst (kein Leak, dass das Projekt überhaupt
  // existiert).
  const [{ data: project }, { data: membership }, { data: coverRow }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, title")
        .eq("id", project_id)
        .single(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", project_id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("project_covers")
        .select("image_url, theme, metadata")
        .eq("project_id", project_id)
        .maybeSingle(),
    ]);

  if (!project || !membership) notFound();

  // Cover-Row als sicheres CoverRowRaw casten — Supabase liefert metadata
  // als Json|null; wir vertrauen unserem Save-Action-Schema (schema_version 1).
  const raw: CoverRowRaw | null = coverRow
    ? {
        image_url: coverRow.image_url,
        theme: coverRow.theme,
        metadata:
          (coverRow.metadata as CoverRowRaw["metadata"]) ?? null,
      }
    : null;

  // Storage-Pfad (NICHT signed URL) — wird vom Client mitgepostet beim Save.
  const initialImagePath: string | null = raw?.image_url ?? null;

  // Signed URL für die Live-Vorschau erzeugen, falls ein Foto existiert.
  let signedImageUrl: string | null = null;
  if (initialImagePath) {
    const { data: signed } = await supabase.storage
      .from("project-covers")
      .createSignedUrl(initialImagePath, 60 * 60);
    signedImageUrl = signed?.signedUrl ?? null;
  }

  const initialData: CoverData = {
    title: project.title,
    subtitle: raw?.metadata?.subtitle ?? "",
    authorLine: raw?.metadata?.author_line ?? "",
    themeId: raw?.theme ?? DEFAULT_THEME_ID,
    colorId: raw?.metadata?.background_color ?? DEFAULT_COLOR_ID,
    imageUrl: signedImageUrl,
  };

  return (
    <>
      <Navbar />
      <main className="[font-family:var(--font-lato)] box-border min-h-full w-full min-w-0 flex-1 bg-[#FAF8F6] px-4 pb-20 pt-[calc(7.348rem+2rem)] sm:px-6 sm:pb-16 sm:pt-[calc(7.348rem+2.5rem)] md:px-8 md:pt-[calc(7.348rem+3rem)] xl:pl-[calc(11rem+2rem)] xl:pr-8 xl:pt-12">
        <div className="mx-auto flex w-full max-w-[1213px] flex-col gap-8 sm:gap-10 md:gap-12">
          <header className="flex flex-col gap-2 sm:gap-3">
            <Link
              href={`/projektuebersicht/${project_id}`}
              className="inline-flex w-fit max-w-full flex-row items-center gap-2 text-base leading-6 text-black hover:underline sm:text-lg sm:leading-7"
            >
              <IconArrowLeft />
              Zurück zur Projektübersicht
            </Link>
            <h1 className="[font-family:var(--font-merriweather)] mt-1 text-3xl font-medium leading-10 text-[#3E3831] sm:mt-2 sm:text-4xl sm:leading-[1.2] md:text-5xl">
              Cover bearbeiten
            </h1>
            <p className="text-lg leading-8 text-[#535252] sm:text-xl sm:leading-9">
              Gestalten Sie die Vorderseite Ihres Buches. Änderungen werden
              automatisch gespeichert.
            </p>
          </header>

          <section className="flex flex-col gap-5 bg-white p-5 sm:gap-6 sm:p-8">
            <CoverEditorClient
              projectId={project_id}
              initialData={initialData}
              initialImagePath={initialImagePath}
            />
          </section>
        </div>
      </main>
    </>
  );
}
