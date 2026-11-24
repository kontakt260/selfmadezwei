"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ImageFormat } from "@/lib/kapiteleditor/types";
import { toast } from "sonner";
import "react-image-crop/dist/ReactCrop.css";

// PROJ-34: Querformat 3:2 oder Hochformat 2:3. Ein Hochformat steht in zwei
// Dritteln der Textbreite und braucht entsprechend weniger Pixel.
const ASPECT: Record<ImageFormat, number> = { quer: 3 / 2, hoch: 2 / 3 };
const MIN_WIDTH_PX: Record<ImageFormat, number> = { quer: 1477, hoch: 985 };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type UploadedImage = {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  format: ImageFormat;
};

function cropFor(format: ImageFormat, width: number, height: number): Crop {
  const aspect = ASPECT[format];
  // Die begrenzende Seite füllt 90 %, sonst ragt der Rahmen aus dem Foto.
  const size = width / height > aspect ? { height: 90 } : { width: 90 };
  return centerCrop(makeAspectCrop({ unit: "%", ...size }, aspect, width, height), width, height);
}

export function ImageUploadDialog({
  open,
  onOpenChange,
  onUploaded,
  onClosedFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Der Dialog bleibt offen, bis das Foto gespeichert ist. */
  onUploaded: (img: UploadedImage) => Promise<boolean>;
  /** Setzt den Fokus nach dem Schließen zurück in den Text. */
  onClosedFocus?: () => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgFileName, setImgFileName] = useState<string>("bild.jpg");
  const [format, setFormat] = useState<ImageFormat>("quer");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImgSrc(null);
    setImgFileName("bild.jpg");
    setFormat("quer");
    setCrop(undefined);
    setCompletedCrop(null);
    setNaturalSize(null);
    setBusy(false);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Datei zu groß. Maximum 10 MB pro Bild.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImgFileName(file.name);
      setImgSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const applyFormat = (next: ImageFormat, image: HTMLImageElement) => {
    setFormat(next);
    const nextCrop = cropFor(next, image.width, image.height);
    setCrop(nextCrop);
    setCompletedCrop(convertToPixelCrop(nextCrop, image.width, image.height));
    if (image.naturalWidth < MIN_WIDTH_PX[next]) {
      toast.warning(
        `Bild ist mit ${image.naturalWidth} px etwas klein für Druck — empfohlen sind mindestens ${MIN_WIDTH_PX[next]} px Breite.`,
      );
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const image = e.currentTarget;
    setNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
    applyFormat(image.naturalHeight > image.naturalWidth ? "hoch" : "quer", image);
  };

  const confirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !naturalSize) {
      toast.error("Bitte Bildausschnitt wählen.");
      return;
    }
    setBusy(true);
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop);
      const previewUrl = URL.createObjectURL(blob);
      const saved = await onUploaded({ blob, previewUrl, fileName: imgFileName, format });
      if (!saved) {
        URL.revokeObjectURL(previewUrl);
        setBusy(false);
        return;
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crop fehlgeschlagen.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Während des Speicherns bleibt der Dialog offen.
        if (!o && busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (!onClosedFocus) return;
          event.preventDefault();
          onClosedFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-normal">Bild hinzufügen</DialogTitle>
          <DialogDescription>
            Wählen Sie eine Datei, das Format und den Bildausschnitt für den Buchdruck.
          </DialogDescription>
        </DialogHeader>

        {!imgSrc ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className="flex min-h-[16rem] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-[#e0dcd5] bg-[#FAF8F6] p-8 text-center transition-colors hover:border-[#96B897]"
          >
            <Upload className="h-8 w-8 text-[#848484]" />
            <p className="text-base font-medium text-[#3E3831]">
              Datei hierher ziehen oder klicken
            </p>
            <p className="text-sm text-[#848484]">
              JPEG oder PNG, max. 10 MB · empfohlen mindestens {MIN_WIDTH_PX.quer} px Breite
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ToggleGroup
              type="single"
              value={format}
              disabled={busy}
              onValueChange={(value) => {
                if ((value === "quer" || value === "hoch") && imgRef.current) {
                  applyFormat(value, imgRef.current);
                }
              }}
              variant="outline"
              size="sm"
              className="justify-start"
              aria-label="Bildformat"
            >
              <ToggleGroupItem value="quer" className="px-3">
                Querformat
              </ToggleGroupItem>
              <ToggleGroupItem value="hoch" className="px-3">
                Hochformat
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center justify-center bg-[#1a1a1a] p-3">
              <ReactCrop
                crop={crop}
                aspect={ASPECT[format]}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                keepSelection
                minWidth={50}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt=""
                  onLoad={onImageLoad}
                  style={{ maxHeight: "60vh", display: "block" }}
                />
              </ReactCrop>
            </div>
            {naturalSize && (
              <p className="text-xs text-[#848484]">
                Original: {naturalSize.w} × {naturalSize.h} px
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Abbrechen
          </Button>
          {imgSrc && (
            <Button type="button" onClick={confirmCrop} disabled={busy || !completedCrop}>
              {busy ? "Wird übernommen…" : "Übernehmen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function cropToBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const targetW = Math.round(crop.width * scaleX);
  const targetH = Math.round(crop.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    targetW,
    targetH,
    0,
    0,
    targetW,
    targetH,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht exportiert werden."))),
      "image/jpeg",
      0.92,
    );
  });
}
