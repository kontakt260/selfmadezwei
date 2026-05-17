"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import "react-image-crop/dist/ReactCrop.css";

const ASPECT = 3 / 2;
const MIN_WIDTH_PX = 1477;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type UploadedImage = {
  blob: Blob;
  previewUrl: string;
  fileName: string;
};

export function ImageUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (img: UploadedImage) => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgFileName, setImgFileName] = useState<string>("bild.jpg");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImgSrc(null);
    setImgFileName("bild.jpg");
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

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight, width, height } = e.currentTarget;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
    if (naturalWidth < MIN_WIDTH_PX) {
      toast.warning(
        `Bild ist mit ${naturalWidth} px etwas klein für Druck — empfohlen sind mindestens ${MIN_WIDTH_PX} px Breite.`,
      );
    }
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, ASPECT, width, height),
      width,
      height,
    );
    setCrop(initialCrop);
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
      onUploaded({ blob, previewUrl, fileName: imgFileName });
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
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-normal">Bild hinzufügen</DialogTitle>
          <DialogDescription>
            Wähle eine Datei und passe den Bildausschnitt an (festes Verhältnis 3:2 für den
            Buchdruck).
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
              JPEG oder PNG, max. 10 MB · empfohlen mindestens {MIN_WIDTH_PX} px Breite
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
            <div className="flex items-center justify-center bg-[#1a1a1a] p-3">
              <ReactCrop
                crop={crop}
                aspect={ASPECT}
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
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Abbrechen
          </Button>
          {imgSrc && (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Andere Datei wählen
              </Button>
              <Button type="button" onClick={confirmCrop} disabled={busy || !completedCrop}>
                {busy ? "Wird übernommen…" : "Übernehmen"}
              </Button>
            </>
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
