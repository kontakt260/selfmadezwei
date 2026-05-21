// PROJ-10 Cover-Editor — Single-Source-of-Truth-Renderer.
//
// Eine Komponente rendert die Cover-Vorderseite in drei Kontexten:
//   - "editor":   große Live-Vorschau im Editor (~400 px breit)
//   - "overview": Karte in der Projektübersicht (~240 px breit)
//   - "card":     Mini-Thumbnail auf der Startseite (~120 px breit)
//
// Alle internen Größen (Schriften, Foto-Rahmen, Padding) sind in
// container-query-Units (cqw) bzw. relativ — keine harten Pixel —
// damit das Cover bei jeder Container-Größe verlustfrei skaliert.
// Aspect-Ratio des Wrappers ist fix 148:210 (A5-Hochformat).

import Image from "next/image";
import type { CoverData, CoverSize } from "@/lib/cover-types";
import { getCoverColor } from "@/lib/cover-colors";
import { getCoverTheme } from "@/lib/cover-themes";

type Props = {
  data: CoverData;
  size: CoverSize;
  className?: string;
};

/**
 * Maximale Schriftgröße in cqw (Container-Query-Width-Units).
 * 1 cqw = 1 % der Container-Breite. Wir benutzen größere Werte für
 * "editor"-Kontext (mehr Inhalt sichtbar) und kleinere für "card".
 */
function titleFontSizeCqw(size: CoverSize): number {
  if (size === "editor") return 10.5;
  if (size === "overview") return 11;
  return 11.5; // card — leicht kompakter
}

function subtitleFontSizeCqw(size: CoverSize): number {
  if (size === "editor") return 4.2;
  if (size === "overview") return 4.5;
  return 5;
}

function authorFontSizeCqw(size: CoverSize): number {
  if (size === "editor") return 3.6;
  if (size === "overview") return 3.8;
  return 4.2;
}

export function CoverRender({ data, size, className }: Props) {
  const color = getCoverColor(data.colorId);
  const theme = getCoverTheme(data.themeId);

  // In sehr kleinen Größen (Card) müssen Untertitel + Autor unter Umständen
  // ausgeblendet werden, weil die Schrift sonst unleserlich klein wird.
  // Wir steuern das per data-Attribut + CSS-Klasse, damit kein Layout-
  // Sprung beim Resize entsteht.
  const showSubtitle = size !== "card" || data.subtitle.trim().length > 0;
  const showAuthor = size !== "card" || data.authorLine.trim().length > 0;

  return (
    <div
      className={`relative isolate w-full overflow-hidden ${className ?? ""}`}
      style={{
        aspectRatio: "148 / 210",
        backgroundColor: color.surface,
        color: color.ink,
        containerType: "inline-size",
        fontFamily: "var(--font-merriweather), serif",
        boxShadow:
          size === "editor"
            ? "0 6px 20px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)"
            : "0 2px 8px rgba(0,0,0,0.12)",
      }}
      role="img"
      aria-label={
        data.title
          ? `Buchcover: ${data.title}${data.authorLine ? `, ${data.authorLine}` : ""}`
          : "Buchcover"
      }
    >
      {/* Muster-Layer (absolut, hinter dem Inhalt) */}
      <theme.Render color={color} />

      {/* Inhalt-Layer: Foto-Rahmen oben + Titel-Block + Autor-Zeile unten. */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{ padding: "8cqw" }}
      >
        {/* Foto-Bereich (oberes Drittel, ~60 % Breite zentriert).
            Wenn kein Foto: leerer Spacer mit identischer Höhe — damit
            der Titel-Block immer auf derselben Y-Position sitzt. */}
        <div
          className="mx-auto"
          style={{
            width: "60%",
            aspectRatio: "4 / 3",
            marginTop: "4cqw",
            marginBottom: "5cqw",
            position: "relative",
            overflow: "hidden",
            backgroundColor: data.imageUrl ? "transparent" : "transparent",
          }}
        >
          {data.imageUrl ? (
            <Image
              src={data.imageUrl}
              alt=""
              fill
              sizes="60vw"
              style={{ objectFit: "cover" }}
              unoptimized
            />
          ) : null}
        </div>

        {/* Titel-Block — mittig, mehrzeilig erlaubt */}
        <div
          className="flex-1 flex flex-col items-center text-center"
          style={{ paddingLeft: "4cqw", paddingRight: "4cqw" }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-merriweather), serif",
              fontWeight: 500,
              fontSize: `${titleFontSizeCqw(size)}cqw`,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: color.ink,
              overflowWrap: "break-word",
              hyphens: "none",
            }}
          >
            {data.title || " "}
          </h2>
          {showSubtitle && data.subtitle ? (
            <p
              style={{
                margin: 0,
                marginTop: "3cqw",
                fontFamily: "var(--font-pt-serif), serif",
                fontStyle: "italic",
                fontSize: `${subtitleFontSizeCqw(size)}cqw`,
                lineHeight: 1.3,
                color: color.ink,
                opacity: 0.85,
                overflowWrap: "break-word",
              }}
            >
              {data.subtitle}
            </p>
          ) : null}
        </div>

        {/* Autor-Zeile unten — bei sehr kleinen Cards optional ausgeblendet */}
        {showAuthor ? (
          <p
            style={{
              margin: 0,
              marginTop: "auto",
              paddingBottom: "2cqw",
              textAlign: "center",
              fontFamily: "var(--font-pt-serif), serif",
              fontSize: `${authorFontSizeCqw(size)}cqw`,
              lineHeight: 1.25,
              color: color.ink,
              opacity: 0.9,
              overflowWrap: "break-word",
            }}
          >
            {data.authorLine}
          </p>
        ) : null}
      </div>
    </div>
  );
}
