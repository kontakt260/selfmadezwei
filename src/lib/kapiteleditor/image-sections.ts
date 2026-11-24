import type {
  ChapterImage,
  ImageLayout,
  ImageSectionData,
  ImageSections,
} from "./types";

// PROJ-34: Bildabschnitte an jeder Textstelle.
//
// Im Kapiteltext steht nur eine Markierung mit der ID des Abschnitts. Layout,
// Fotos und Formate liegen in `chapters.image_sections`. Die IDs `start` und
// `end` bleiben gültig, damit bestehende Kapitel ohne Umschreiben lesbar sind.

export const MAX_IMAGES_PER_SECTION = 60;
export const MAX_IMAGES_PER_CHAPTER = 120;
export const IMAGE_SECTION_NODE = "imageSection";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isImageSectionId(value: unknown): value is string {
  return value === "start" || value === "end" || (typeof value === "string" && UUID_RE.test(value));
}

function parseLayout(value: unknown): ImageLayout {
  return value === "2-spaltig" ? "2-spaltig" : "1-spaltig";
}

function parseImage(raw: unknown): ChapterImage | null {
  if (!raw || typeof raw !== "object") return null;
  const image = raw as Record<string, unknown>;
  if (typeof image.id !== "string" || !image.id) return null;
  if (typeof image.storage_path !== "string" || !image.storage_path) return null;
  return {
    id: image.id,
    storage_path: image.storage_path,
    signed_url: "",
    alt: typeof image.alt === "string" ? image.alt : "",
    ...(image.format === "hoch" ? { format: "hoch" as const } : {}),
  };
}

function parseSection(raw: unknown): ImageSectionData {
  if (!raw || typeof raw !== "object") return { layout: "1-spaltig", images: [] };
  const section = raw as Record<string, unknown>;
  const images = Array.isArray(section.images) ? section.images : [];
  return {
    layout: parseLayout(section.layout),
    images: images.map(parseImage).filter((image): image is ChapterImage => image !== null),
  };
}

/** Liest gespeicherte Bilddaten. Unbrauchbare Einträge werden ausgelassen. */
export function parseImageSections(raw: unknown): ImageSections {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const parsed: ImageSections = {
    start: parseSection(data.start),
    end: parseSection(data.end),
  };
  if (data.inline && typeof data.inline === "object" && !Array.isArray(data.inline)) {
    const inline: Record<string, ImageSectionData> = {};
    for (const [id, section] of Object.entries(data.inline)) {
      if (UUID_RE.test(id)) inline[id] = parseSection(section);
    }
    if (Object.keys(inline).length > 0) parsed.inline = inline;
  }
  if (data.placed === true) parsed.placed = true;
  return parsed;
}

export function sectionEntries(sections: ImageSections): Array<[string, ImageSectionData]> {
  return [
    ["start", sections.start],
    ["end", sections.end],
    ...Object.entries(sections.inline ?? {}),
  ];
}

export function allImages(sections: ImageSections): ChapterImage[] {
  return sectionEntries(sections).flatMap(([, section]) => section.images);
}

export function getImageSection(sections: ImageSections, id: string): ImageSectionData | undefined {
  if (id === "start") return sections.start;
  if (id === "end") return sections.end;
  return sections.inline?.[id];
}

/** Neuer Stand mit geändertem Abschnitt. `null` entfernt einen Abschnitt im Text. */
export function withImageSection(
  sections: ImageSections,
  id: string,
  section: ImageSectionData | null,
): ImageSections {
  if (id === "start" || id === "end") {
    return { ...sections, [id]: section ?? { layout: sections[id].layout, images: [] } };
  }
  const inline = { ...sections.inline };
  if (section) inline[id] = section;
  else delete inline[id];
  const next: ImageSections = { ...sections, inline };
  if (Object.keys(inline).length === 0) delete next.inline;
  return next;
}

export function withSignedUrls(sections: ImageSections, links: Map<string, string>): ImageSections {
  const sign = (section: ImageSectionData): ImageSectionData => ({
    ...section,
    images: section.images.map((image) => ({
      ...image,
      signed_url: links.get(image.storage_path) ?? "",
    })),
  });
  const signed: ImageSections = {
    ...sections,
    start: sign(sections.start),
    end: sign(sections.end),
  };
  if (sections.inline) {
    signed.inline = Object.fromEntries(
      Object.entries(sections.inline).map(([id, section]) => [id, sign(section)]),
    );
  }
  return signed;
}

/** Die IDs der Bildabschnitte im Text, in Lesereihenfolge. */
export function collectImageSectionIds(body: unknown): unknown[] {
  // Ohne Rekursion: Der Text kommt vom Client und kann tief verschachtelt sein.
  const ids: unknown[] = [];
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const current = node as { type?: unknown; attrs?: { sectionId?: unknown }; content?: unknown };
    if (current.type === IMAGE_SECTION_NODE) ids.push(current.attrs?.sectionId);
    if (Array.isArray(current.content)) {
      for (let i = current.content.length - 1; i >= 0; i -= 1) stack.push(current.content[i]);
    }
  }
  return ids;
}

type BodyNode = { type?: unknown; attrs?: { sectionId?: unknown }; content?: unknown };

/** Zwischen zwei Bildabschnitten steht immer eine Zeile, ein Umbruch zählt nicht. */
function withTextBetweenSections(nodes: BodyNode[]): BodyNode[] {
  const result: BodyNode[] = [];
  let afterSection = false;
  for (const node of nodes) {
    if (node?.type === IMAGE_SECTION_NODE) {
      if (afterSection) result.push({ type: "paragraph" });
      afterSection = true;
    } else if (node?.type !== "pageBreak") {
      afterSection = false;
    }
    result.push(node);
  }
  if (result.at(-1)?.type === IMAGE_SECTION_NODE) result.push({ type: "paragraph" });
  return result;
}

/**
 * Bereitet ein Kapitel für den Editor vor. Bei alten Kapiteln kommen die Fotos
 * von Anfang und Ende als Abschnitte in den Text. Abschnitte ohne Fotos fallen
 * weg, Fotos ohne Platz im Text landen am Kapitelende, damit keines verloren
 * geht. Ändert sich nichts, bleibt `body` dasselbe Objekt: Das Öffnen allein
 * löst dann kein Speichern aus.
 */
export function prepareChapterImages(
  body: unknown,
  stored: ImageSections,
): { body: unknown; imageSections: ImageSections } {
  const imageSections: ImageSections = { ...stored, placed: true };
  const root = body && typeof body === "object" ? (body as BodyNode) : null;
  const original = Array.isArray(root?.content) ? (root.content as BodyNode[]) : [];
  const hasPhotos = (id: string) => (getImageSection(stored, id)?.images.length ?? 0) > 0;

  const placed = new Set<string>();
  const kept = original.filter((node) => {
    if (node?.type !== IMAGE_SECTION_NODE) return true;
    const id = node.attrs?.sectionId;
    if (!isImageSectionId(id) || !hasPhotos(id) || placed.has(id)) return false;
    placed.add(id);
    return true;
  });

  const missing = sectionEntries(stored)
    .map(([id]) => id)
    .filter((id) => hasPhotos(id) && !placed.has(id));
  const sectionNode = (sectionId: string): BodyNode => ({
    type: IMAGE_SECTION_NODE,
    attrs: { sectionId },
  });
  const before = !stored.placed && missing.includes("start") ? [sectionNode("start")] : [];
  const after = missing
    .filter((id) => stored.placed || id !== "start")
    // `end` gehört bei alten Kapiteln ganz ans Ende.
    .sort((a, b) => Number(a === "end") - Number(b === "end"))
    .map(sectionNode);

  const content = [...before, ...kept, ...after];
  if (content.length === 0) return { body, imageSections };
  const next = withTextBetweenSections(content);
  const unchanged =
    next.length === original.length && next.every((node, index) => node === original[index]);
  return {
    body: unchanged ? body : { ...(root ?? {}), type: "doc", content: next },
    imageSections,
  };
}

/** Nur eine Datei direkt im Ordner dieses Kapitels. */
export function isInChapterFolder(path: string, projectId: string, chapterId: string): boolean {
  const prefix = `${projectId}/${chapterId}/`;
  return path.startsWith(prefix) && FILE_NAME_RE.test(path.slice(prefix.length));
}

/**
 * Eine Datei irgendwo im Ordner dieses Projekts. Ältere Kapitel können Fotos aus
 * einem anderen Unterordner haben. Lesen dürfen Mitglieder sie ohnehin, gelöscht
 * wird automatisch nur im Ordner des eigenen Kapitels.
 */
export function isInProjectFolder(path: string, projectId: string): boolean {
  const prefix = `${projectId}/`;
  if (!path.startsWith(prefix)) return false;
  const parts = path.slice(prefix.length).split("/");
  return parts.length <= 3 && parts.every((part) => FILE_NAME_RE.test(part));
}

export function imageLimitError(sectionCount: number, chapterCount: number): string | null {
  if (sectionCount > MAX_IMAGES_PER_SECTION) {
    return `Ein Bildabschnitt kann höchstens ${MAX_IMAGES_PER_SECTION} Fotos enthalten.`;
  }
  if (chapterCount > MAX_IMAGES_PER_CHAPTER) {
    return `Ein Kapitel kann höchstens ${MAX_IMAGES_PER_CHAPTER} Fotos enthalten.`;
  }
  return null;
}

export type ImageSectionsCheck =
  | { ok: true; foreignPaths: string[] }
  | { ok: false; error: string };

/**
 * Prüft die Bilddaten vor dem Speichern. `foreignPaths` liegen außerhalb des
 * Projektordners: Sie sind nur erlaubt, wenn das Kapitel sie schon gespeichert hat.
 */
export function checkImageSections(input: {
  projectId: string;
  chapterId: string;
  sections: ImageSections;
  body: unknown;
}): ImageSectionsCheck {
  const { projectId, sections, body } = input;
  const entries = sectionEntries(sections);
  const images = allImages(sections);

  if (entries.length > MAX_IMAGES_PER_CHAPTER) {
    return { ok: false, error: "Das Kapitel enthält zu viele Bildabschnitte." };
  }
  for (const [, section] of entries) {
    const limit = imageLimitError(section.images.length, images.length);
    if (limit) return { ok: false, error: limit };
  }

  if (
    new Set(images.map((image) => image.id)).size !== images.length ||
    new Set(images.map((image) => image.storage_path)).size !== images.length
  ) {
    return { ok: false, error: "Ein Foto darf nur einmal im Kapitel stehen." };
  }

  if (sections.placed) {
    const ids = collectImageSectionIds(body);
    if (new Set(ids).size !== ids.length) {
      return { ok: false, error: "Ein Bildabschnitt darf nur einmal im Text stehen." };
    }
    for (const id of ids) {
      if (!isImageSectionId(id) || !getImageSection(sections, id)) {
        return { ok: false, error: "Der Text enthält einen unbekannten Bildabschnitt." };
      }
    }
  }

  return {
    ok: true,
    foreignPaths: images
      .map((image) => image.storage_path)
      .filter((path) => !isInProjectFolder(path, projectId)),
  };
}

function storedSection(section: ImageSectionData): ImageSectionData {
  return {
    layout: section.layout,
    images: section.images.map((image) => ({
      id: image.id,
      storage_path: image.storage_path,
      signed_url: "",
      alt: image.alt ?? "",
      ...(image.format === "hoch" ? { format: "hoch" as const } : {}),
    })),
  };
}

/**
 * Stand für die Datenbank: ohne Bildlinks und, sobald die Positionen im Text
 * stehen, nur mit Abschnitten, die der Text wirklich verwendet. So landen die
 * Fotos entfernter Abschnitte auf der Aufräumliste.
 */
export function imageSectionsForSave(sections: ImageSections, body: unknown): ImageSections {
  const used = sections.placed ? new Set(collectImageSectionIds(body)) : null;
  const keep = (id: string, section: ImageSectionData) =>
    !used || used.has(id) ? storedSection(section) : { layout: section.layout, images: [] };

  const stored: ImageSections = {
    start: keep("start", sections.start),
    end: keep("end", sections.end),
  };
  const inline = Object.entries(sections.inline ?? {})
    .filter(([id]) => !used || used.has(id))
    .map(([id, section]): [string, ImageSectionData] => [id, storedSection(section)]);
  if (inline.length > 0) stored.inline = Object.fromEntries(inline);
  if (sections.placed) stored.placed = true;
  return stored;
}
