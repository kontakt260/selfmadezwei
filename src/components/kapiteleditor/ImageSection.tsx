"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, ImagePlus, Trash2, Plus } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  imagesPerPage,
  type ChapterImage,
  type ImageLayout,
  type ImageSectionData,
} from "@/lib/kapiteleditor/types";
import { ImageUploadDialog, type UploadedImage } from "./ImageUploadDialog";

export function ImageSection({
  data,
  onChange,
  onUpload,
  onDelete,
}: {
  data: ImageSectionData;
  onChange: (next: ImageSectionData) => void;
  onUpload: (img: UploadedImage) => Promise<ChapterImage>;
  onDelete: (image: ChapterImage) => Promise<void>;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChapterImage | null>(null);
  // Hydration-Gate: @dnd-kit verwendet einen Modul-globalen Counter für
  // `aria-describedby="DndDescribedBy-N"`. Zwischen SSR und Client-Hydration
  // kann der Counter differieren → React Hydration-Mismatch. Lösung: DnD-
  // Sortable-Slots erst NACH Mount rendern; pre-mount ist die Sektion leer
  // (kurzer SSR-Frame, danach client-side hydrated mit DnD).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const sectionRef = useRef<HTMLDivElement>(null);
  // Word-/Docs-Verhalten: nach jeder Image-Mutation soll der bearbeitete
  // Bereich im Viewport sichtbar sein (Spec 2026-05-18 vom Nutzer:
  // „scroll to image section if updates / changes are made").
  const scrollSectionIntoView = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = sectionRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const toolbar = document.querySelector(".editor-chrome") as HTMLElement | null;
        const top = toolbar ? toolbar.getBoundingClientRect().bottom : 0;
        const bottom = window.innerHeight - 80;
        if (r.top < top + 16) {
          window.scrollBy({ top: r.top - (top + 16), behavior: "smooth" });
        } else if (r.bottom > bottom) {
          window.scrollBy({ top: r.bottom - bottom, behavior: "smooth" });
        }
      });
    });
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleLayoutChange = (value: string) => {
    if (value === "1-spaltig" || value === "2-spaltig") {
      onChange({ ...data, layout: value as ImageLayout });
      scrollSectionIntoView();
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = data.images.findIndex((i) => i.id === active.id);
    const newIdx = data.images.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange({ ...data, images: arrayMove(data.images, oldIdx, newIdx) });
    scrollSectionIntoView();
  };

  const handleUploaded = async (img: UploadedImage) => {
    try {
      const newImage = await onUpload(img);
      onChange({ ...data, images: [...data.images, newImage] });
      scrollSectionIntoView();
    } catch {
      /* upstream already toasted */
    }
  };

  const handleDelete = async (image: ChapterImage) => {
    try {
      await onDelete(image);
      onChange({ ...data, images: data.images.filter((i) => i.id !== image.id) });
      scrollSectionIntoView();
    } catch {
      /* upstream already toasted */
    }
  };

  const hasImages = data.images.length > 0;
  // Reihen-Chunking: 1-spaltig = 1 Bild/Reihe, 2-spaltig = 2 Bilder/Reihe.
  // Jede Reihe ist eine eigene paginierbare Einheit (data-paginate-row) und
  // wird von der Pagination-Engine bei Überlauf auf die nächste Seite geschoben.
  const perRow = data.layout === "2-spaltig" ? 2 : 1;
  const rows: ChapterImage[][] = [];
  for (let i = 0; i < data.images.length; i += perRow) {
    rows.push(data.images.slice(i, i + perRow));
  }

  return (
    <div
      ref={sectionRef}
      className="group/section relative"
      data-image-section-wrapper
    >
      {/* Controls erscheinen nur wenn Bilder da sind UND auf Hover.
       * Hover-Bridge + Delay-on-Leave verhindert, dass das Menu beim
       * Cursor-Übergang vom Bild zu den Buttons zu früh verschwindet. */}
      {hasImages && (
        <>
          <div
            className="absolute -top-8 left-0 right-0 h-8 z-[5]"
            aria-hidden
          />
          <div
            className="editor-chrome pointer-events-none absolute -top-9 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity duration-150 [transition-delay:300ms] group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-hover/section:[transition-delay:0ms] group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100 group-focus-within/section:[transition-delay:0ms]"
          >
            <ToggleGroup
              type="single"
              value={data.layout}
              onValueChange={handleLayoutChange}
              size="sm"
              variant="outline"
              className="rounded-none border border-[#e0dcd5] bg-white shadow-sm"
            >
              <ToggleGroupItem value="1-spaltig" aria-label="1 Bild pro Zeile" className="h-7 px-2 text-[10pt]">
                1
              </ToggleGroupItem>
              <ToggleGroupItem value="2-spaltig" aria-label="2 Bilder nebeneinander" className="h-7 px-2 text-[10pt]">
                2
              </ToggleGroupItem>
            </ToggleGroup>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              aria-label="Bild hinzufügen"
              className="flex h-7 items-center gap-1 border border-[#e0dcd5] bg-white px-2 text-[10pt] text-[#3E3831] shadow-sm transition-colors hover:bg-[#FAF8F6]"
            >
              <Plus className="h-3 w-3" />
              Bild
            </button>
          </div>
        </>
      )}

      {!hasImages ? (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          aria-label="Bild hinzufügen"
          className="image-section-empty"
          data-paginate-row
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Bild hinzufügen
        </button>
      ) : !mounted ? (
        // Pre-Hydration: Static-Render der Image-Slots ohne DnD-Attribute.
        // Verhindert Hydration-Mismatch durch @dnd-kit's globalen
        // aria-describedby-Counter, der SSR ↔ Client divergieren kann.
        <>
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="image-section"
              data-layout={data.layout}
              data-paginate-row
            >
              {row.map((img) => (
                <div key={img.id} className="image-slot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.signed_url} alt={img.alt} />
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.images.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            {rows.map((row, rowIdx) => (
              <div
                key={rowIdx}
                className="image-section"
                data-layout={data.layout}
                data-paginate-row
              >
                {row.map((img) => (
                  <SortableSlot
                    key={img.id}
                    image={img}
                    onDelete={() => setConfirmDelete(img)}
                  />
                ))}
              </div>
            ))}
          </SortableContext>
        </DndContext>
      )}

      <ImageUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={handleUploaded}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">Bild entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Bild wird aus dieser Bild-Sektion gelöscht. Du kannst es danach neu hochladen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const img = confirmDelete;
                setConfirmDelete(null);
                if (img) handleDelete(img);
              }}
            >
              Bild entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableSlot({
  image,
  onDelete,
}: {
  image: ChapterImage;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("image-slot group/slot")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.signed_url} alt={image.alt} />
      <div className="editor-chrome absolute inset-x-0 top-0 flex justify-between p-1.5 opacity-0 transition-opacity group-hover/slot:opacity-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Bild verschieben"
          className="flex h-6 w-6 cursor-grab items-center justify-center bg-white/95 text-[#3E3831] shadow-sm hover:bg-white active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Bild löschen"
          className="flex h-6 w-6 items-center justify-center bg-white/95 text-destructive shadow-sm hover:bg-white"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Re-exportiert für externe Konsumenten (Estimate-Schätzungen etc.)
export { imagesPerPage };
