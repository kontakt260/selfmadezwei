import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhoneNotice } from "@/components/kapiteleditor/PhoneNotice";
import { EditorClient } from "@/components/kapiteleditor/EditorClient";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  const [{ data: chapter }, { data: membership }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, body, image_sections, project_id, start_page, source_impulse_id")
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

  // PROJ-8: wenn das Kapitel auf einen Impuls verweist, laden wir den
  // referenzierten Impuls für das Banner mit. Bei NULL (PROJ-4-Bestand
  // ODER Eigenes-Kapitel) bleibt initialImpulse null und das Banner
  // wird nicht gerendert.
  let initialImpulse: { title: string; leadingQuestions: string[] } | null = null;
  if (chapter.source_impulse_id) {
    const { data: impulseRow } = await supabase
      .from("impulse_catalog")
      .select("title, leading_questions")
      .eq("id", chapter.source_impulse_id)
      .maybeSingle();
    if (impulseRow) {
      initialImpulse = {
        title: impulseRow.title,
        leadingQuestions: impulseRow.leading_questions ?? [],
      };
    }
  }

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
          initialStartPage={chapter.start_page ?? 1}
          initialImpulse={initialImpulse}
        />
      </div>
    </>
  );
}
