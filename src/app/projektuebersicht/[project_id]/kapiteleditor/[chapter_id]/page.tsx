import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhoneNotice } from "@/components/kapiteleditor/PhoneNotice";
import { EditorClient } from "@/components/kapiteleditor/EditorClient";
import { EMPTY_IMAGE_SECTIONS, type ImageSections } from "@/lib/kapiteleditor/types";

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

  const [{ data: chapter }, { data: membership }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, body, project_id")
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

  // image_sections-Spalte existiert erst nach /backend für PROJ-5 — bis dahin
  // starten wir immer mit dem leeren Zustand.
  const initialImageSections: ImageSections = EMPTY_IMAGE_SECTIONS;

  return (
    <>
      <div className="md:hidden">
        <PhoneNotice projectId={project_id} />
      </div>
      <div className="hidden md:block">
        <EditorClient
          projectId={project_id}
          chapterId={chapter_id}
          initialTitle={chapter.title}
          initialBody={chapter.body}
          initialImageSections={initialImageSections}
        />
      </div>
    </>
  );
}
