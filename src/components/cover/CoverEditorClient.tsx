"use client";

// PROJ-10 Cover-Editor — Editor-Client mit Live-Vorschau + Auto-Save.
//
// Aufbau:
//   - Eingabe-Spalte links/oben:   Titel / Untertitel / Autor / Muster /
//                                  Farbe / Foto-Upload
//   - Vorschau-Spalte rechts/unten: <CoverRender size="editor" />
//
// Auto-Save: 2 Sek Debounce nach letzter Änderung. Anzeige:
//   - „Speichern …" während Server-Action läuft
//   - „Gespeichert HH:MM" nach Erfolg
//   - „Konnte nicht speichern" mit Retry-Hinweis bei Fehler
//
// Foto-Upload läuft client-direkt zum Storage-Bucket `project-covers`.
// Nach Upload-Erfolg ruft der Client `getCoverImageSignedUrlAction`
// für die signed URL, setzt sie lokal in den State (sofortige Vorschau)
// und triggert Auto-Save mit dem neuen Storage-Pfad.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CoverRender } from "@/components/cover/CoverRender";
import { coverFonts } from "@/components/cover/coverFonts";
import { DEFAULT_BOOK_FONT, bookFont } from "@/lib/book-fonts";
import { ReadOnlyScope } from "@/components/ReadOnlyScope";
import { COVER_COLORS } from "@/lib/cover-colors";
import { COVER_THEMES } from "@/lib/cover-themes";
import { trackSave } from "@/lib/pending-saves";
import type { CoverData } from "@/lib/cover-types";
import {
  saveCoverAction,
  getCoverImageSignedUrlAction,
  type SaveCoverInput,
} from "@/app/projektuebersicht/[project_id]/cover-bearbeiten/actions";
import { formatSavedTime, normalizeSingleLine, FieldShell, readImageDimensions } from "./cover-editor-parts";

// Max-Werte aus Spec (Acceptance Criteria)
const TITLE_MAX = 60;
const SUBTITLE_MAX = 80;
const AUTHOR_MAX = 80;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PHOTO_MIN_PX = 1500;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

const AUTOSAVE_DEBOUNCE_MS = 2000;

type Props = {
  projectId: string;
  initialData: CoverData;
  // Der Storage-Pfad (NICHT die signed URL). Wird beim Auto-Save mit
  // gepostet. Beim Foto-Wechsel überschreibt der Client diesen lokal.
  initialImagePath: string | null;
  // PROJ-28: Zugang abgelaufen. Das Cover bleibt sichtbar, Felder sind gesperrt.
  readOnly?: boolean;
};

type SaveState =
  | { kind: "idle"; lastSavedAt: Date | null }
  | { kind: "pending" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

export function CoverEditorClient({
  projectId,
  initialData,
  initialImagePath,
  readOnly = false,
}: Props) {
  const router = useRouter();

  // Form-State
  const [title, setTitle] = useState(initialData.title);
  const [subtitle, setSubtitle] = useState(initialData.subtitle);
  const [authorLine, setAuthorLine] = useState(initialData.authorLine);
  const [themeId, setThemeId] = useState(initialData.themeId);
  const [colorId, setColorId] = useState(initialData.colorId);
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath);
  const [imageUrl, setImageUrl] = useState<string | null>(initialData.imageUrl);

  // Save-State
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: null,
  });
  const [isPending, startTransition] = useTransition();

  // Foto-Upload-State
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce-Timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMountRef = useRef(true);

  // Letzter erfolgreich gespeicherter Stand — wird verwendet, um zu
  // erkennen, ob ein neuer Auto-Save überhaupt nötig ist.
  const lastSavedRef = useRef<SaveCoverInput>({
    projectId,
    title: initialData.title,
    subtitle: initialData.subtitle,
    authorLine: initialData.authorLine,
    themeId: initialData.themeId,
    colorId: initialData.colorId,
    imagePath: initialImagePath,
  });

  // PROJ-30: Eine Änderung, die noch auf das verzögerte Speichern wartet. Sie
  // geht beim Verlassen der Seite sofort zum Server.
  const unsavedRef = useRef<SaveCoverInput | null>(null);

  // PROJ-32: Buchschrift, nur zur Anzeige. Der Name steht in seiner eigenen Schrift.
  const currentBookFont = initialData.bookFont ?? DEFAULT_BOOK_FONT;
  const fontNameStyle =
    currentBookFont === DEFAULT_BOOK_FONT
      ? { variables: "", family: "var(--font-pt-serif), serif" }
      : { variables: coverFonts(currentBookFont).variables, family: coverFonts(currentBookFont).title };

  // ── CoverData für den Renderer ─────────────────────────────────────────
  const previewData: CoverData = useMemo(
    () => ({
      title,
      subtitle,
      authorLine,
      themeId,
      colorId,
      imageUrl,
      bookFont: initialData.bookFont,
    }),
    [title, subtitle, authorLine, themeId, colorId, imageUrl, initialData.bookFont],
  );

  // ── Auto-Save (debounced) ──────────────────────────────────────────────
  const performSave = useCallback(() => {
    const payload: SaveCoverInput = {
      projectId,
      title: title.trim(),
      subtitle: subtitle.trim(),
      authorLine: authorLine.trim(),
      themeId,
      colorId,
      imagePath,
    };

    unsavedRef.current = null;

    // Wenn der Titel nach Trim leer wäre, blockieren wir den Save —
    // die UI zeigt eine Inline-Validierung.
    if (payload.title.length === 0) {
      setSaveState({
        kind: "error",
        message: "Titel darf nicht leer sein.",
      });
      return;
    }

    // Wenn nichts geändert wurde gegenüber dem letzten Save: skip.
    const last = lastSavedRef.current;
    if (
      last.title === payload.title &&
      last.subtitle === payload.subtitle &&
      last.authorLine === payload.authorLine &&
      last.themeId === payload.themeId &&
      last.colorId === payload.colorId &&
      last.imagePath === payload.imagePath
    ) {
      return;
    }

    setSaveState({ kind: "pending" });
    startTransition(async () => {
      const result = await trackSave(saveCoverAction(payload));
      if (result.error) {
        setSaveState({ kind: "error", message: result.error });
        return;
      }
      lastSavedRef.current = payload;
      setSaveState({ kind: "saved", at: new Date() });
      // Übersicht + Startseite müssen den neuen Stand mitbekommen — wir
      // refreshen die Route-Daten, ohne den Editor zu reloaden.
      router.refresh();
    });
  }, [
    projectId,
    title,
    subtitle,
    authorLine,
    themeId,
    colorId,
    imagePath,
    router,
  ]);

  // Debounce-Effekt: bei jeder relevanten State-Änderung starten wir
  // einen neuen Timer; vorher gestartete Timer werden gelöscht.
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (readOnly) return;
    unsavedRef.current = {
      projectId,
      title: title.trim(),
      subtitle: subtitle.trim(),
      authorLine: authorLine.trim(),
      themeId,
      colorId,
      imagePath,
    };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    title,
    subtitle,
    authorLine,
    themeId,
    colorId,
    imagePath,
    performSave,
    projectId,
    readOnly,
  ]);

  // PROJ-30: Beim Verlassen der Seite nichts verlieren.
  useEffect(() => {
    const flush = () => {
      const payload = unsavedRef.current;
      unsavedRef.current = null;
      if (!payload || payload.title.length === 0) return;
      const last = lastSavedRef.current;
      if (
        last.title === payload.title &&
        last.subtitle === payload.subtitle &&
        last.authorLine === payload.authorLine &&
        last.themeId === payload.themeId &&
        last.colorId === payload.colorId &&
        last.imagePath === payload.imagePath
      ) {
        return;
      }
      lastSavedRef.current = payload;
      void trackSave(saveCoverAction(payload));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // ── Foto-Upload ────────────────────────────────────────────────────────
  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Input direkt zurücksetzen, damit derselbe File ggf. erneut
      // ausgewählt werden kann (z. B. nach einem Fehler).
      e.target.value = "";
      if (!file) return;
      setPhotoError(null);
      setPhotoWarning(null);

      // Größen-Check
      if (file.size > PHOTO_MAX_BYTES) {
        setPhotoError(
          "Das Bild ist größer als 10 MB. Bitte ein kleineres Foto wählen.",
        );
        return;
      }

      // Extension-Check (HEIC/HEIF aus iOS wird hier abgelehnt)
      const dotIdx = file.name.lastIndexOf(".");
      const ext = (dotIdx >= 0 ? file.name.slice(dotIdx + 1) : "")
        .toLowerCase()
        .trim();
      if (!ALLOWED_EXT.has(ext)) {
        setPhotoError(
          "Format wird nicht unterstützt. Bitte ein JPG, PNG oder WebP wählen.",
        );
        return;
      }

      // Optional: Auflösung prüfen — Warnung, kein Block.
      try {
        const dims = await readImageDimensions(file);
        if (dims.width < PHOTO_MIN_PX || dims.height < PHOTO_MIN_PX) {
          setPhotoWarning(
            `Das Bild ist sehr klein (${dims.width} × ${dims.height} px) und wird im gedruckten Buch unscharf wirken. Empfohlen sind mindestens ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px.`,
          );
        }
      } catch {
        // Dimensions-Read schlägt fehl bei sehr exotischen Formaten —
        // Upload trotzdem zulassen, RLS und Backend filtern weiter.
      }

      setPhotoUploading(true);

      try {
        const supabase = createClient();
        const path = `${projectId}/cover-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("project-covers")
          .upload(path, file, {
            contentType: file.type || `image/${ext}`,
            upsert: false,
          });
        if (upErr) {
          setPhotoError(
            "Der Upload ist fehlgeschlagen. Bitte später erneut versuchen.",
          );
          return;
        }

        // Signed URL für sofortige Vorschau besorgen
        const { signedUrl, error: signErr } =
          await getCoverImageSignedUrlAction({
            projectId,
            imagePath: path,
          });
        if (signErr || !signedUrl) {
          setPhotoError(
            "Vorschau konnte nicht geladen werden. Seite neu laden.",
          );
          return;
        }

        // Lokalen State setzen — triggert Auto-Save automatisch
        setImagePath(path);
        setImageUrl(signedUrl);
      } catch {
        setPhotoError("Unerwarteter Fehler beim Upload.");
      } finally {
        setPhotoUploading(false);
      }
    },
    [projectId],
  );

  const onRemovePhoto = useCallback(() => {
    setImagePath(null);
    setImageUrl(null);
    setPhotoError(null);
    setPhotoWarning(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const saveLabel = (() => {
    if (readOnly) return "Nur zum Ansehen";
    if (saveState.kind === "pending" || isPending) return "Speichern …";
    if (saveState.kind === "saved")
      return `Gespeichert ${formatSavedTime(saveState.at)}`;
    if (saveState.kind === "error") return saveState.message;
    return "Bereit";
  })();
  const saveLabelTone =
    saveState.kind === "error" ? "text-[#a05959]" : "text-[#848484]";

  return (
    <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[1fr_minmax(280px,440px)] lg:items-start lg:gap-10">
      {/* ─── Eingabe-Spalte ─────────────────────────────────────── */}
      <ReadOnlyScope readOnly={readOnly}>
      <div className="flex flex-col gap-6">
        {/* Titel */}
        <FieldShell
          label="Titel"
          hint={`${title.length}/${TITLE_MAX}`}
          required
        >
          <input
            type="text"
            value={title}
            onChange={(e) =>
              setTitle(normalizeSingleLine(e.target.value).slice(0, TITLE_MAX))
            }
            maxLength={TITLE_MAX}
            className="form_input"
            placeholder="z. B. Mein Leben"
            aria-label="Buchtitel"
          />
          <p className="text-sm leading-5 text-[#848484]">
            Tipp: Zeilenumbrüche im Titel werden nicht automatisch
            gesetzt. Möchten Sie ein langes Wort umbrechen, fügen Sie an
            der gewünschten Stelle einen Bindestrich ein.
          </p>
        </FieldShell>

        {/* Untertitel */}
        <FieldShell
          label="Untertitel (optional)"
          hint={`${subtitle.length}/${SUBTITLE_MAX}`}
        >
          <input
            type="text"
            value={subtitle}
            onChange={(e) =>
              setSubtitle(
                normalizeSingleLine(e.target.value).slice(0, SUBTITLE_MAX),
              )
            }
            maxLength={SUBTITLE_MAX}
            className="form_input"
            placeholder="z. B. Erinnerungen aus 80 Jahren"
            aria-label="Untertitel"
          />
        </FieldShell>

        {/* Autor-Zeile */}
        <FieldShell
          label="Autor-Zeile (optional)"
          hint={`${authorLine.length}/${AUTHOR_MAX}`}
        >
          <input
            type="text"
            value={authorLine}
            onChange={(e) =>
              setAuthorLine(
                normalizeSingleLine(e.target.value).slice(0, AUTHOR_MAX),
              )
            }
            maxLength={AUTHOR_MAX}
            className="form_input"
            placeholder="z. B. von Maria Müller"
            aria-label="Autor-Zeile"
          />
        </FieldShell>

        {/* PROJ-32: Die Schrift kommt aus dem Buch, geändert wird sie im Kapitel-Editor. */}
        <FieldShell label="Schrift" as="div">
          <p className="text-base leading-7 text-[#535252]" data-testid="cover-book-font">
            <span className={`text-lg text-[#3E3831] ${fontNameStyle.variables}`} style={{ fontFamily: fontNameStyle.family }}>
              {bookFont(currentBookFont).label}
            </span>
            {" "}
            · Die Schrift gilt für das ganze Buch. Sie ändern sie im Kapitel-Editor über „Buchschrift“ in der Werkzeugleiste.
          </p>
        </FieldShell>

        {/* Muster-Picker */}
        <FieldShell label="Muster" as="div">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {COVER_THEMES.map((t) => {
              const active = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  className={`flex flex-col items-center gap-2 border p-2 transition-colors ${
                    active
                      ? "border-[#3E3831] bg-[#FAF8F6]"
                      : "border-[#e0dcd5] bg-white hover:border-[#c5bfb5]"
                  }`}
                  aria-pressed={active}
                  aria-label={`Muster ${t.label}${active ? ", ausgewählt" : ""}`}
                >
                  <div className="w-full">
                    <CoverRender
                      data={{
                        title: "Aa",
                        subtitle: "",
                        authorLine: "",
                        themeId: t.id,
                        colorId,
                        imageUrl: null,
                        bookFont: initialData.bookFont,
                      }}
                      size="card"
                    />
                  </div>
                  <span className="text-xs text-[#535252]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </FieldShell>

        {/* Farb-Picker */}
        <FieldShell label="Hintergrundfarbe" as="div">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-8">
            {COVER_COLORS.map((c) => {
              const active = c.id === colorId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorId(c.id)}
                  className={`flex flex-col items-center gap-2 border p-2 transition-colors ${
                    active
                      ? "border-[#3E3831] bg-[#FAF8F6]"
                      : "border-[#e0dcd5] bg-white hover:border-[#c5bfb5]"
                  }`}
                  aria-pressed={active}
                  aria-label={`Farbe ${c.label}${active ? ", ausgewählt" : ""}`}
                >
                  <span
                    className="block h-10 w-full"
                    style={{ backgroundColor: c.surface }}
                  />
                  <span className="text-xs text-[#535252]">{c.label}</span>
                </button>
              );
            })}
          </div>
        </FieldShell>

        {/* Foto-Upload */}
        <FieldShell label="Cover-Foto (optional)" as="div">
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-5 text-[#848484]">
              JPG, PNG oder WebP. Max. 10 MB. Empfohlen: mindestens 1500 × 1500
              px für Print-Qualität.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onPickFile}
                disabled={photoUploading}
                className="inline-flex h-11 cursor-pointer items-center justify-center bg-[#597083] px-5 text-base font-semibold text-white transition-colors hover:bg-[#4e6376] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {photoUploading
                  ? "Wird hochgeladen …"
                  : imagePath
                  ? "Foto ersetzen"
                  : "Foto hochladen"}
              </button>
              {imagePath ? (
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  disabled={photoUploading}
                  className="inline-flex h-11 cursor-pointer items-center justify-center border border-[#e0dcd5] bg-white px-5 text-base font-semibold text-[#3E3831] transition-colors hover:bg-[#f5f3f0] disabled:opacity-50"
                >
                  Foto entfernen
                </button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onFileChange}
            />
            {photoError ? (
              <p role="alert" className="text-sm leading-5 text-[#a05959]">
                {photoError}
              </p>
            ) : null}
            {photoWarning ? (
              <p className="text-sm leading-5 text-[#a07a59]">
                {photoWarning}
              </p>
            ) : null}
          </div>
        </FieldShell>
      </div>
      </ReadOnlyScope>

      {/* ─── Vorschau-Spalte ────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="sticky top-[calc(7.348rem+1rem)] flex flex-col gap-3">
          <div className="text-sm font-medium text-[#848484]">Vorschau</div>
          <div className="mx-auto w-full max-w-[440px]">
            <CoverRender data={previewData} size="editor" />
          </div>
          <p
            className={`text-sm leading-5 ${saveLabelTone}`}
            aria-live="polite"
          >
            {saveLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
