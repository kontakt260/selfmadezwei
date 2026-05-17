"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";
import type { ChapterImage, ImageLayout, ImageSectionData } from "@/lib/kapiteleditor/types";
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleLayoutChange = (value: string) => {
    if (value === "1-spaltig" || value === "2-spaltig") {
      onChange({ ...data, layout: value as ImageLayout });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = data.images.findIndex((i) => i.id === active.id);
    const newIdx = data.images.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange({ ...data, images: arrayMove(data.images, oldIdx, newIdx) });
  };

  const handleUploaded = async (img: UploadedImage) => {
    try {
      const newImage = await onUpload(img);
      onChange({ ...data, images: [...data.images, newImage] });
    } catch {
      /* upstream already toasted */
    }
  };

  const handleDelete = async (image: ChapterImage) => {
    try {
      await onDelete(image);
      onChange({ ...data, images: data.images.filter((i) => i.id !== image.id) });
    } catch {
      /* upstream already toasted */
    }
  };

  const hasImages = data.images.length > 0;

  return (
    <div className="group/section relative">
      {/* Controls erscheinen nur wenn Bilder da sind UND auf Hover.
       * Hover-Bridge + Delay-on-Leave verhindert, dass das Menu beim
       * Cursor-Übergang vom Bild zu den Buttons zu früh verschwindet. */}
      {hasImages && (
        <>
          {/* Unsichtbare Hover-Brücke über dem Bild-Grid, damit der Cursor
           * den Gap zwischen Menu und Bildern überqueren kann ohne Hover-Verlust. */}
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
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Bild hinzufügen
        </button>
      ) : (
        <div className="image-section" data-layout={data.layout}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={data.images.map((i) => i.id)}
              strategy={rectSortingStrategy}
            >
              {data.images.map((img) => (
                <SortableSlot key={img.id} image={img} onDelete={() => handleDelete(img)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <ImageUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={handleUploaded}
      />
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

  const style = {
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
