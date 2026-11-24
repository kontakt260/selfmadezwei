// PROJ-35: Trenn-Baustein. Liefert für einen Absatz die erlaubten Trennstellen
// nach den Buchregeln. Der Editor zeigt sie nur an, im gespeicherten Text stehen
// nie Trennzeichen. Derselbe Baustein soll später auch dem Druck (PROJ-16)
// dieselben Trennstellen liefern.
//
// Wörterbuch: deutsche Trennmuster, neue Rechtschreibung, aus hyph-utf8
// (Deutschsprachige Trennmustermannschaft, MIT-Lizenz), über das Paket `hyphen`
// (ISC-Lizenz). Das frühere Musterpaket hatte keine Lizenzangabe.

export const SOFT_HYPHEN = "­";

/** Kürzere Wörter werden nie getrennt (3 + 3 Buchstaben). */
export const MIN_WORD_LETTERS = 6;
/** Mindestens so viele Buchstaben stehen vor und nach jeder Trennstelle. */
export const MIN_PART_LETTERS = 3;

/**
 * Englische Wörter, die im deutschen Text vorkommen und nach den deutschen
 * Mustern anders getrennt würden als im Englischen. Sie bleiben ganz (Spec
 * AC-13: im Zweifel bleibt ein Fremdwort ganz). Kleinschreibung.
 */
const KEEP_WHOLE = new Set([
  "meeting",
  "meetings",
  "feeling",
  "feelings",
  "weekend",
  "weekends",
  "shopping",
  "marketing",
  "happening",
  "timing",
  "jogging",
  "catering",
  "recycling",
  "wellness",
  "business",
  "teenager",
  "babysitter",
  "newsletter",
  "homepage",
]);

/** Gibt das Wort mit weichen Trennzeichen an jeder möglichen Trennstelle zurück. */
export type WordHyphenator = (word: string) => string;

// Ziffern, Mail- und Webadressen, Pfade: bleiben immer ganz.
const KEEP_CHUNK_WHOLE = /[\d@/\\_]|www\.|:\/\//u;
// Bindestrich oder Gedankenstrich zwischen Buchstaben: nur dort umbrechen.
const HAS_INNER_DASH = /\p{L}[-‐‑–—]\p{L}/u;
// Buchstabenkern eines Wortes mit Satzzeichen davor und danach.
const WORD_CORE = /^[^\p{L}]*([\p{L}\p{M}'’]+)[^\p{L}]*$/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Erlaubte Trennstellen in einem Absatztext, als Abstand vom Absatzanfang
 * (die Trennung kommt vor das Zeichen an dieser Stelle).
 */
export function findBreakPoints(text: string, hyphenateWord: WordHyphenator): number[] {
  const chunks = Array.from(text.matchAll(/\S+/gu));
  // Das letzte Wort eines Absatzes bleibt ganz, damit kein Wortrest allein in
  // der letzten Zeile steht (Spec AC-10).
  let lastWord = -1;
  chunks.forEach((chunk, index) => {
    if (HAS_LETTER.test(chunk[0])) lastWord = index;
  });

  const points: number[] = [];
  chunks.forEach((chunk, index) => {
    if (index === lastWord) return;
    const raw = chunk[0];
    if (KEEP_CHUNK_WHOLE.test(raw) || HAS_INNER_DASH.test(raw)) return;
    const core = WORD_CORE.exec(raw);
    if (!core) return;
    const word = core[1];
    // Apostroph („gibt's"), ganz in Großbuchstaben („NARRAVIT"), zu kurz oder englisch: ganz.
    if (/['’]/u.test(word)) return;
    if (word.length < MIN_WORD_LETTERS) return;
    if (word === word.toUpperCase()) return;
    if (KEEP_WHOLE.has(word.toLowerCase())) return;

    const start = (chunk.index ?? 0) + raw.indexOf(word);
    const hyphenated = hyphenateWord(word);
    let offset = 0;
    for (let i = 0; i < hyphenated.length; i += 1) {
      if (hyphenated[i] === SOFT_HYPHEN) {
        if (offset >= MIN_PART_LETTERS && word.length - offset >= MIN_PART_LETTERS) {
          points.push(start + offset);
        }
      } else {
        offset += 1;
      }
    }
  });
  return points;
}

/** Wortweise Trennung aus der `hyphenateSync`-Funktion des Pakets. */
export function createWordHyphenator(
  hyphenateSync: (text: string, options?: { hyphenChar?: string; minWordLength?: number }) => string,
): WordHyphenator {
  return (word) => hyphenateSync(word, { hyphenChar: SOFT_HYPHEN, minWordLength: MIN_WORD_LETTERS });
}

// Das Wörterbuch ist groß (rund 150 KB gepackt). Es wird nur im Editor gebraucht,
// beim Öffnen parallel zur Seite geladen und danach im Modul behalten.
let hyphenator: WordHyphenator | null = null;
let loading: Promise<void> | null = null;

export function loadHyphenation(): Promise<void> {
  if (hyphenator) return Promise.resolve();
  loading ??= import("hyphen/de-1996")
    .then((mod) => {
      hyphenator = createWordHyphenator(mod.hyphenateSync ?? mod.default.hyphenateSync);
    })
    .catch((error: unknown) => {
      // Ohne Wörterbuch bleibt der Text ungetrennt, der Editor funktioniert weiter.
      loading = null;
      console.error("[hyphenation] Wörterbuch konnte nicht geladen werden", error);
    });
  return loading;
}

export function isHyphenationReady(): boolean {
  return hyphenator !== null;
}

/** Trennstellen eines Absatzes, leer solange das Wörterbuch noch lädt. */
export function hyphenationPoints(text: string): number[] {
  return hyphenator ? findBreakPoints(text, hyphenator) : [];
}

export function stripSoftHyphens(text: string): string {
  return text.includes(SOFT_HYPHEN) ? text.split(SOFT_HYPHEN).join("") : text;
}

/**
 * Entfernt weiche Trennzeichen aus allen Textknoten eines Kapiteltexts.
 * Ohne Treffer kommt dasselbe Objekt zurück, damit kein Speichern ausgelöst wird.
 */
export function stripSoftHyphensFromBody<T>(body: T): T {
  if (!body || typeof body !== "object") return body;
  if (Array.isArray(body)) {
    let changed = false;
    const next = body.map((item) => {
      const stripped = stripSoftHyphensFromBody(item);
      if (stripped !== item) changed = true;
      return stripped;
    });
    return (changed ? next : body) as T;
  }
  const node = body as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  if (typeof node.text === "string" && node.text.includes(SOFT_HYPHEN)) {
    next = { ...node, text: stripSoftHyphens(node.text) };
  }
  if (Array.isArray(node.content)) {
    const content = stripSoftHyphensFromBody(node.content);
    if (content !== node.content) next = { ...(next ?? node), content };
  }
  return (next ?? body) as T;
}
