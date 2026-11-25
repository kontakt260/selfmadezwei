import { BOOK_FONT_FAMILY_VAR, bookFont, DEFAULT_BOOK_FONT, type BookFontId } from "@/lib/book-fonts";

// PROJ-32: Eine Buchschrift wird mit allen vier Schnitten geladen, bevor Text in
// ihr gesetzt wird. Sonst bricht der Text um, sobald später Kursiv oder Fett
// nachlädt, und Seitenzahlen würden mit einer Ersatzschrift gemessen.

const STYLES = ["400", "700", "italic 400", "italic 700"] as const;

/** So lange darf eine Schrift laden, danach gilt sie als nicht ladbar (Spec AC-18). */
export const FONT_LOAD_MAX_MS = 6000;

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/** Erste Familie einer `font-family`-Liste, ohne Anführungszeichen. */
export function primaryFamily(value: string): string | null {
  const first = unquote(value.split(",")[0] ?? "");
  return first || null;
}

/**
 * Lädt die Schrift `id` mit allen Schnitten. `scope`: ein Element, an dem die
 * CSS-Variablen der Buchschriften gelten. `true`, wenn alle Schnitte bereitstehen.
 */
export async function loadBookFont(
  id: BookFontId,
  scope: Element,
  timeoutMs = FONT_LOAD_MAX_MS,
): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const family = primaryFamily(getComputedStyle(scope).getPropertyValue(BOOK_FONT_FAMILY_VAR[id]));
  if (!family) return false;

  const all = Promise.all(
    STYLES.map(async (style) => {
      const faces = await document.fonts.load(`${style} 16px "${family}"`, "Äß");
      return faces.some((face) => unquote(face.family) === family && face.status === "loaded");
    }),
  ).then(
    (results) => results.every(Boolean),
    () => false,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([all, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CSS-Variablen an der A5-Seite für eine Buchschrift. Für die Vorgabe PT Serif
 * bleibt alles leer, dann gilt das bisherige Bild (Titel in Merriweather, AC-3).
 */
export function bookFontStyle(id: BookFontId): Record<string, string> {
  if (id === DEFAULT_BOOK_FONT) return {};
  const family = `var(${BOOK_FONT_FAMILY_VAR[id]})`;
  return {
    "--book-font": family,
    "--book-title-font": family,
    "--book-scale": String(bookFont(id).scale),
  };
}
