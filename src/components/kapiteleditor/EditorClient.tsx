"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import { ArrowLeft } from "lucide-react";
import { editorExtensions } from "./tiptap/extensions";
import { EditorToolbar } from "./EditorToolbar";
import { FirstPageHeader } from "./FirstPageTemplate";
import { ImageSection } from "./ImageSection";
import { SaveStatus } from "./SaveStatus";
import { WordCount } from "./WordCount";
import { useAutoSave } from "@/hooks/useAutoSave";
import { countWordsFromBody, countPageBreaksFromBody } from "@/lib/kapiteleditor/countWords";
import {
  EMPTY_IMAGE_SECTIONS,
  type ChapterDraft,
  type ChapterImage,
  type ImageSections,
} from "@/lib/kapiteleditor/types";
import type { UploadedImage } from "./ImageUploadDialog";
import { toast } from "sonner";

type Props = {
  projectId: string;
  chapterId: string;
  initialTitle: string;
  initialBody: unknown;
  initialImageSections: ImageSections;
};

export function EditorClient({
  projectId,
  chapterId,
  initialTitle,
  initialBody,
  initialImageSections,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState<unknown>(initialBody);
  const [imageSections, setImageSections] = useState<ImageSections>(
    initialImageSections ?? EMPTY_IMAGE_SECTIONS,
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialBody ?? undefined,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setBody(editor.getJSON());
    },
    immediatelyRender: false,
  });

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      [...imageSections.start.images, ...imageSections.end.images].forEach((img) => {
        if (img.signed_url.startsWith("blob:")) URL.revokeObjectURL(img.signed_url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft: ChapterDraft = useMemo(
    () => ({
      title,
      body,
      imageSections,
      colorPageCount: estimateColorPages(imageSections),
    }),
    [title, body, imageSections],
  );

  const { state, retry } = useAutoSave(draft, saveDraftStub, 2_000);

  const wordCount = useMemo(() => countWordsFromBody(body), [body]);
  const pageCount = useMemo(() => countPageBreaksFromBody(body) + 1, [body]);

  const updateSection = (key: "start" | "end") => (next: ImageSections["start"]) => {
    setImageSections((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <div className="a5-desk [font-family:var(--font-lato)] flex min-h-[100dvh] flex-col pb-16">
      <header className="editor-chrome sticky top-0 z-40 flex flex-col gap-2 border-b border-[#e0dcd5] bg-[#ece6df]/95 px-4 py-3 backdrop-blur sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link
          href={`/projektuebersicht/${projectId}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-[#3E3831] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Projektübersicht
        </Link>
        <div className="flex flex-1 items-center gap-3 md:justify-center">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kapitel-Titel"
            className="[font-family:var(--font-merriweather)] w-full max-w-md border-0 border-b border-transparent bg-transparent px-1 py-1 text-center text-lg text-[#3E3831] outline-none transition-colors focus:border-[#96B897] md:text-xl"
            aria-label="Kapitel-Titel"
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 md:min-w-[12rem]">
          <SaveStatus state={state} onRetry={retry} />
        </div>
      </header>

      <EditorToolbar editor={editor} />

      <main className="flex flex-1 flex-col items-center gap-8 px-4 py-8 sm:px-6 md:px-10">
        <div className="a5-stack" data-chapter-id={chapterId}>
          {/* Hintergrund: N fest-große A5-Frames, gestapelt mit Gap */}
          <div className="a5-stack__bg" aria-hidden>
            {Array.from({ length: pageCount }).map((_, i) => (
              <div key={i} className="a5-page-frame" />
            ))}
          </div>
          {/* Vordergrund: Editor + Bild-Sektionen */}
          <div className="a5-stack__fg">
            <FirstPageHeader title={title} />
            <ImageSection
              data={imageSections.start}
              onChange={updateSection("start")}
              onUpload={uploadImageStub}
              onDelete={deleteImageStub}
            />
            <EditorContent editor={editor} />
            <ImageSection
              data={imageSections.end}
              onChange={updateSection("end")}
              onUpload={uploadImageStub}
              onDelete={deleteImageStub}
            />
          </div>
        </div>
      </main>

      <footer className="editor-chrome fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-[#e0dcd5] bg-white/95 px-4 py-2 backdrop-blur sm:px-6">
        <WordCount words={wordCount} />
        <span className="text-xs text-[#a8a39b]">
          Auto-Speichern alle 2 Sekunden · A5-Format · Druck-Vorschau
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stubs — werden in /backend (PROJ-5) durch echte Server Actions ersetzt
// ---------------------------------------------------------------------------

async function saveDraftStub(_draft: ChapterDraft): Promise<void> {
  await new Promise((r) => setTimeout(r, 600));
}

async function uploadImageStub(img: UploadedImage): Promise<ChapterImage> {
  await new Promise((r) => setTimeout(r, 400));
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toast.success("Bild hinzugefügt (lokal — Backend folgt in /backend).");
  return {
    id,
    storage_path: `local://${img.fileName}`,
    signed_url: img.previewUrl,
    alt: "",
  };
}

async function deleteImageStub(image: ChapterImage): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  if (image.signed_url.startsWith("blob:")) URL.revokeObjectURL(image.signed_url);
}

// Sehr grobe Schätzung: jede Sektion füllt ungefähr eine halbe A5-Seite pro
// Reihe (1-spaltig = 1 Bild/Reihe, 2-spaltig = 2 Bilder/Reihe). Genaue Zählung
// kommt in PROJ-16 (PDF-Renderer ist die Wahrheit).
function estimateColorPages(s: ImageSections): number {
  const rows = (sec: ImageSections["start"]) =>
    Math.ceil(sec.images.length / (sec.layout === "2-spaltig" ? 2 : 1));
  const pagesPer = (rowCount: number) => Math.ceil(rowCount / 2);
  return pagesPer(rows(s.start)) + pagesPer(rows(s.end));
}
