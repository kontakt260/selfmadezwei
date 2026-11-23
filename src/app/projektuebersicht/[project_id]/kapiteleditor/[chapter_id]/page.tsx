import { redirect, notFound } from "next/navigation";
import { assertLoaded, isUuid } from "@/lib/supabase/page-data";
import { createClient } from "@/lib/supabase/server";
import { FreshAfterHistory } from "@/components/HistoryFreshness";
import { PhoneNotice } from "@/components/kapiteleditor/PhoneNotice";
import { EditorClient } from "@/components/kapiteleditor/EditorClient";
import { isProjectReadOnly } from "@/lib/projects/project-access";
import {
  EMPTY_IMAGE_SECTIONS,
  type ChapterImage,
  type ImageSectionData,
  type ImageSections,
} from "@/lib/kapiteleditor/types";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h

function isValidLayout(value: unknown): value is "1-spaltig" | "2-spaltig" {
  return value === "1-spaltig" || value === "2-spaltig";
}

function parseSection(raw: unknown): ImageSectionData {
  if (!raw || typeof raw !== "object") return { layout: "1-spaltig", images: [] };
  const r = raw as Record<string, unknown>;
  const layout = isValidLayout(r.layout) ? r.layout : "1-spaltig";
  const imagesRaw = Array.isArray(r.images) ? r.images : [];
  const images: ChapterImage[] = imagesRaw
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const x = it as Record<string, unknown>;
      const id = typeof x.id === "string" ? x.id : null;
      const storage_path = typeof x.storage_path === "string" ? x.storage_path : null;
      if (!id || !storage_path) return null;
      return {
        id,
        storage_path,
        signed_url: "",
        alt: typeof x.alt === "string" ? x.alt : "",
      } as ChapterImage;
    })
    .filter((x): x is ChapterImage => x !== null);
  return { layout, images };
}

function parseImageSections(raw: unknown): ImageSections {
  if (!raw || typeof raw !== "object") return EMPTY_IMAGE_SECTIONS;
  const r = raw as Record<string, unknown>;
  return {
    start: parseSection(r.start),
    end: parseSection(r.end),
  };
}

export default async function KapiteleditorPage({
  params,
}: {
  params: Promise<{ project_id: string; chapter_id: string }>;
}) {
  const { project_id, chapter_id } = await params;
  if (!isUuid(project_id) || !isUuid(chapter_id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  // PROJ-30: Gleichzeitig statt nacheinander. Der Impuls fürs Banner (PROJ-8)
  // kommt direkt mit dem Kapitel.
  const [chapterResult, membershipResult, readOnly] = await Promise.all([
    supabase
      .from("chapters")
      .select(
        "id, title, body, image_sections, project_id, start_page, page_count, updated_at, impulse_catalog(title, leading_questions)",
      )
      .eq("id", chapter_id)
      .eq("project_id", project_id)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    isProjectReadOnly(supabase, project_id),
  ]);

  assertLoaded(chapterResult, membershipResult);
  const chapter = chapterResult.data;
  if (!chapter || !membershipResult.data) notFound();

  const initialImageSections = parseImageSections(chapter.image_sections);

  // Signed URLs für alle gespeicherten Bilder erzeugen (1h gültig). Falls die
  // Sektionen leer sind, spart das den Storage-Aufruf.
  const allPaths = [
    ...initialImageSections.start.images.map((i) => i.storage_path),
    ...initialImageSections.end.images.map((i) => i.storage_path),
  ];

  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("chapter-heroes")
      .createSignedUrls(allPaths, SIGNED_URL_TTL_SECONDS);
    const map = new Map<string, string>();
    (signed ?? []).forEach((s) => {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    });
    initialImageSections.start.images = initialImageSections.start.images.map((i) => ({
      ...i,
      signed_url: map.get(i.storage_path) ?? "",
    }));
    initialImageSections.end.images = initialImageSections.end.images.map((i) => ({
      ...i,
      signed_url: map.get(i.storage_path) ?? "",
    }));
  }

  // PROJ-8: Ohne Impuls (eigenes Kapitel oder Impuls gelöscht) kein Banner.
  const impulse = chapter.impulse_catalog;
  const initialImpulse = impulse
    ? { title: impulse.title, leadingQuestions: impulse.leading_questions ?? [] }
    : null;

  return (
    <>
      <div className="md:hidden">
        <PhoneNotice projectId={project_id} />
      </div>
      <div className="hidden md:block">
        <FreshAfterHistory version={chapter.updated_at}>
          <EditorClient
            projectId={project_id}
            chapterId={chapter_id}
            initialTitle={chapter.title}
            initialBody={chapter.body}
            initialImageSections={initialImageSections}
            initialStartPage={chapter.start_page ?? 1}
            initialPageCount={chapter.page_count}
            initialImpulse={initialImpulse}
            readOnly={readOnly}
          />
        </FreshAfterHistory>
      </div>
    </>
  );
}
