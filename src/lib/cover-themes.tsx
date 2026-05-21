// PROJ-10 Cover-Editor — kuratierte Muster (Themes).
//
// Themes liefern dezente, marken-konforme Cover-Verzierungen. Jedes Theme
// ist ein React-Komponenten-Renderer, der ein <svg>-Layer (Position
// absolute, inset: 0, pointer-events: none) zurückgibt. Die Komponente
// erhält die aktuelle Farbe (`color`) als Prop, sodass das Muster den
// Akzent-Ton der gewählten Hintergrundfarbe übernimmt.
//
// SVG ist hier okay (für Muster, NICHT für Text-Rendering) — die Muster
// sind dekorativ, müssen keine Umlaute/Hyphenation können.

import type { CoverColor } from "@/lib/cover-colors";

export type CoverTheme = {
  id: string;
  label: string;
  // Renderer bekommt die aktuelle Farbe — er entscheidet, ob er `ink` oder
  // `accent` als Stroke/Fill verwendet.
  Render: (props: { color: CoverColor }) => React.ReactElement;
};

// Hilfs-SVG-Wrapper: füllt den Cover-Bereich (148:210), pointer-events: none.
function Layer({
  children,
  viewBox = "0 0 148 210",
}: {
  children: React.ReactNode;
  viewBox?: string;
}): React.ReactElement {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {children}
    </svg>
  );
}

export const COVER_THEMES: readonly CoverTheme[] = [
  {
    id: "schlicht",
    label: "Schlicht",
    Render: () => <Layer>{null}</Layer>,
  },
  {
    id: "linie",
    label: "Linie",
    Render: ({ color }) => (
      <Layer>
        {/* Eine feine horizontale Linie auf etwa 38 % Höhe — trennt
            Foto-Bereich oben vom Titel-Block. */}
        <line
          x1="22"
          x2="126"
          y1="80"
          y2="80"
          stroke={color.accent}
          strokeWidth="0.6"
          opacity="0.85"
        />
        <circle cx="22" cy="80" r="1.2" fill={color.accent} />
        <circle cx="126" cy="80" r="1.2" fill={color.accent} />
      </Layer>
    ),
  },
  {
    id: "rahmen",
    label: "Rahmen",
    Render: ({ color }) => (
      <Layer>
        {/* Innen-Rahmen mit feinem Abstand zur Außenkante */}
        <rect
          x="8"
          y="8"
          width="132"
          height="194"
          fill="none"
          stroke={color.accent}
          strokeWidth="0.4"
          opacity="0.9"
        />
        <rect
          x="11"
          y="11"
          width="126"
          height="188"
          fill="none"
          stroke={color.accent}
          strokeWidth="0.2"
          opacity="0.75"
        />
      </Layer>
    ),
  },
  {
    id: "art-deco",
    label: "Art-Déco",
    Render: ({ color }) => (
      <Layer>
        {/* Vier Ecken mit Raute + Linienzügen */}
        {[
          { x: 14, y: 14, sx: 1, sy: 1 },
          { x: 134, y: 14, sx: -1, sy: 1 },
          { x: 14, y: 196, sx: 1, sy: -1 },
          { x: 134, y: 196, sx: -1, sy: -1 },
        ].map((c, i) => (
          <g key={i} transform={`translate(${c.x}, ${c.y}) scale(${c.sx}, ${c.sy})`}>
            <polygon
              points="0,-3 3,0 0,3 -3,0"
              fill={color.accent}
              opacity="0.95"
            />
            <line x1="6" x2="20" y1="0" y2="0" stroke={color.accent} strokeWidth="0.5" />
            <line x1="0" x2="0" y1="6" y2="20" stroke={color.accent} strokeWidth="0.5" />
          </g>
        ))}
      </Layer>
    ),
  },
  {
    id: "botanik",
    label: "Botanik",
    Render: ({ color }) => (
      <Layer>
        {/* Stilisierter Zweig links unten + rechts oben, gespiegelt */}
        {[
          { x: 18, y: 178, rot: 0 },
          { x: 130, y: 32, rot: 180 },
        ].map((s, i) => (
          <g
            key={i}
            transform={`translate(${s.x}, ${s.y}) rotate(${s.rot})`}
            stroke={color.accent}
            strokeWidth="0.45"
            fill="none"
            opacity="0.9"
          >
            <path d="M0,0 C 6,-8 12,-14 22,-18" />
            <path d="M5,-4 C 8,-7 11,-7 14,-5" />
            <path d="M11,-10 C 14,-13 17,-13 19,-11" />
            <ellipse cx="6" cy="-5" rx="2.2" ry="1.1" transform="rotate(-30 6 -5)" fill={color.accent} opacity="0.55" stroke="none" />
            <ellipse cx="12" cy="-11" rx="2.2" ry="1.1" transform="rotate(-30 12 -11)" fill={color.accent} opacity="0.55" stroke="none" />
            <ellipse cx="18" cy="-15" rx="2.2" ry="1.1" transform="rotate(-30 18 -15)" fill={color.accent} opacity="0.55" stroke="none" />
          </g>
        ))}
      </Layer>
    ),
  },
  {
    id: "punkte",
    label: "Punkte",
    Render: ({ color }) => (
      <Layer>
        {/* Punktraster oben + unten in dezenter Akzent-Farbe */}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle
            key={`top-${i}`}
            cx={20 + i * 9.5}
            cy={18}
            r={0.7}
            fill={color.accent}
            opacity="0.85"
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle
            key={`bot-${i}`}
            cx={20 + i * 9.5}
            cy={192}
            r={0.7}
            fill={color.accent}
            opacity="0.85"
          />
        ))}
      </Layer>
    ),
  },
] as const;

export const DEFAULT_THEME_ID = "schlicht";

export function getCoverTheme(id: string | null | undefined): CoverTheme {
  if (!id) return COVER_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
  const found = COVER_THEMES.find((t) => t.id === id);
  return found ?? COVER_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}
