import { describe, expect, it } from "vitest";
import {
  MAX_IMAGES_PER_CHAPTER,
  MAX_IMAGES_PER_SECTION,
  allImages,
  checkImageSections,
  collectImageSectionIds,
  imageSectionsForSave,
  isImageSectionId,
  isInChapterFolder,
  parseImageSections,
  prepareChapterImages,
  withImageSection,
  withSignedUrls,
} from "./image-sections";
import type { ChapterImage, ImageSections } from "./types";

const PROJECT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CHAPTER = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const SECTION_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SECTION_B = "dddddddd-dddd-4ddd-addd-dddddddddddd";

function image(name: string, extra: Partial<ChapterImage> = {}): ChapterImage {
  return {
    id: name,
    storage_path: `${PROJECT}/${CHAPTER}/${name}.jpg`,
    signed_url: "",
    alt: "",
    ...extra,
  };
}

function images(count: number, prefix = "foto"): ChapterImage[] {
  return Array.from({ length: count }, (_, index) => image(`${prefix}-${index}`));
}

function sections(overrides: Partial<ImageSections> = {}): ImageSections {
  return {
    start: { layout: "1-spaltig", images: [] },
    end: { layout: "1-spaltig", images: [] },
    ...overrides,
  };
}

function doc(...ids: unknown[]) {
  return {
    type: "doc",
    content: ids.flatMap((sectionId) => [
      { type: "paragraph", content: [{ type: "text", text: "Text" }] },
      { type: "imageSection", attrs: { sectionId } },
    ]),
  };
}

function check(input: ImageSections, body: unknown = doc()) {
  return checkImageSections({ projectId: PROJECT, chapterId: CHAPTER, sections: input, body });
}

describe("parseImageSections", () => {
  it("reads the old format unchanged", () => {
    const raw = {
      start: { layout: "2-spaltig", images: [{ id: "a", storage_path: "p/c/a.jpg", alt: "Oma" }] },
      end: { layout: "1-spaltig", images: [] },
    };
    expect(parseImageSections(raw)).toEqual({
      start: {
        layout: "2-spaltig",
        images: [{ id: "a", storage_path: "p/c/a.jpg", signed_url: "", alt: "Oma" }],
      },
      end: { layout: "1-spaltig", images: [] },
    });
  });

  it("keeps sections in the text, their format and the position marker", () => {
    const parsed = parseImageSections({
      start: { layout: "1-spaltig", images: [] },
      end: { layout: "1-spaltig", images: [] },
      inline: { [SECTION_A]: { layout: "2-spaltig", images: [image("a", { format: "hoch" })] } },
      placed: true,
    });
    expect(parsed.placed).toBe(true);
    expect(parsed.inline?.[SECTION_A].layout).toBe("2-spaltig");
    expect(parsed.inline?.[SECTION_A].images[0].format).toBe("hoch");
  });

  it("leaves out broken entries and survives unusable data", () => {
    const parsed = parseImageSections({
      start: { layout: "kaputt", images: [{ id: 5 }, null, image("gut")] },
      end: "kaputt",
      inline: { "keine-id": { layout: "1-spaltig", images: [image("x")] } },
      placed: "ja",
    });
    expect(parsed.start.layout).toBe("1-spaltig");
    expect(parsed.start.images.map((entry) => entry.id)).toEqual(["gut"]);
    expect(parsed.end.images).toEqual([]);
    expect(parsed.inline).toBeUndefined();
    expect(parsed.placed).toBeUndefined();
    expect(parseImageSections(null).start.images).toEqual([]);
  });

  it("treats an unknown format as a landscape photo", () => {
    const parsed = parseImageSections({
      start: { layout: "1-spaltig", images: [{ ...image("a"), format: "rund" }] },
      end: { layout: "1-spaltig", images: [] },
    });
    expect(parsed.start.images[0].format).toBeUndefined();
  });
});

describe("section ids and file paths", () => {
  it("accepts start, end and uuids only", () => {
    expect(isImageSectionId("start")).toBe(true);
    expect(isImageSectionId("end")).toBe(true);
    expect(isImageSectionId(SECTION_A)).toBe(true);
    expect(isImageSectionId("__proto__")).toBe(false);
    expect(isImageSectionId(5)).toBe(false);
  });

  it("accepts only a file directly inside the own chapter folder", () => {
    const inFolder = (path: string) => isInChapterFolder(path, PROJECT, CHAPTER);
    expect(inFolder(`${PROJECT}/${CHAPTER}/foto-1.jpg`)).toBe(true);
    expect(inFolder(`${PROJECT}/${SECTION_A}/foto.jpg`)).toBe(false);
    expect(inFolder(`${SECTION_A}/${CHAPTER}/foto.jpg`)).toBe(false);
    expect(inFolder(`${PROJECT}/${CHAPTER}/unter/foto.jpg`)).toBe(false);
    expect(inFolder(`${PROJECT}/${CHAPTER}/../fremd.jpg`)).toBe(false);
    expect(inFolder(`${PROJECT}/${CHAPTER}/..`)).toBe(false);
    expect(inFolder(`${PROJECT}/${CHAPTER}/`)).toBe(false);
  });
});

describe("collectImageSectionIds", () => {
  it("returns the sections in reading order", () => {
    expect(collectImageSectionIds(doc("start", SECTION_A, "end"))).toEqual([
      "start",
      SECTION_A,
      "end",
    ]);
  });

  it("does not crash on very deep content", () => {
    let node: Record<string, unknown> = { type: "imageSection", attrs: { sectionId: SECTION_A } };
    for (let depth = 0; depth < 50_000; depth += 1) node = { type: "x", content: [node] };
    expect(collectImageSectionIds(node)).toEqual([SECTION_A]);
  });

  it("ignores unusable bodies", () => {
    expect(collectImageSectionIds(null)).toEqual([]);
    expect(collectImageSectionIds("text")).toEqual([]);
  });
});

describe("checkImageSections", () => {
  it("accepts a valid chapter", () => {
    const input = sections({
      start: { layout: "1-spaltig", images: [image("a")] },
      inline: { [SECTION_A]: { layout: "1-spaltig", images: [image("b")] } },
      placed: true,
    });
    expect(check(input, doc("start", SECTION_A))).toEqual({ ok: true, foreignPaths: [] });
  });

  it("allows 60 photos in a section and rejects 61", () => {
    const allowed = sections({ start: { layout: "1-spaltig", images: images(MAX_IMAGES_PER_SECTION) } });
    expect(check(allowed).ok).toBe(true);
    const tooMany = sections({ start: { layout: "1-spaltig", images: images(MAX_IMAGES_PER_SECTION + 1) } });
    expect(check(tooMany)).toEqual({
      ok: false,
      error: "Ein Bildabschnitt kann höchstens 60 Fotos enthalten.",
    });
  });

  it("allows 120 photos in a chapter and rejects 121", () => {
    const allowed = sections({
      start: { layout: "1-spaltig", images: images(60, "a") },
      end: { layout: "1-spaltig", images: images(60, "b") },
    });
    expect(check(allowed).ok).toBe(true);
    const tooMany = sections({
      ...allowed,
      inline: { [SECTION_A]: { layout: "1-spaltig", images: [image("c")] } },
    });
    expect(check(tooMany)).toEqual({
      ok: false,
      error: `Ein Kapitel kann höchstens ${MAX_IMAGES_PER_CHAPTER} Fotos enthalten.`,
    });
  });

  it("rejects a photo used in two sections", () => {
    const input = sections({
      start: { layout: "1-spaltig", images: [image("a")] },
      end: { layout: "1-spaltig", images: [image("a")] },
    });
    expect(check(input).ok).toBe(false);
  });

  it("rejects a section that stands twice in the text", () => {
    const input = sections({
      inline: { [SECTION_A]: { layout: "1-spaltig", images: [image("a")] } },
      placed: true,
    });
    expect(check(input, doc(SECTION_A, SECTION_A))).toEqual({
      ok: false,
      error: "Ein Bildabschnitt darf nur einmal im Text stehen.",
    });
  });

  it("rejects unknown sections in the text", () => {
    const input = sections({ placed: true });
    for (const id of [SECTION_B, "__proto__", undefined]) {
      expect(check(input, doc(id))).toEqual({
        ok: false,
        error: "Der Text enthält einen unbekannten Bildabschnitt.",
      });
    }
  });

  it("does not read positions from the text of an old chapter", () => {
    expect(check(sections(), doc(SECTION_B)).ok).toBe(true);
  });

  it("accepts older photos from another folder of the same project", () => {
    const older = `${PROJECT}/${SECTION_A}/alt.png`;
    const input = sections({
      start: { layout: "1-spaltig", images: [image("a", { storage_path: older })] },
    });
    expect(check(input)).toEqual({ ok: true, foreignPaths: [] });
  });

  it("reports paths outside the project folder", () => {
    const foreign = `${SECTION_A}/${SECTION_B}/fremd.jpg`;
    const input = sections({
      start: { layout: "1-spaltig", images: [image("a", { storage_path: foreign })] },
    });
    expect(check(input)).toEqual({ ok: true, foreignPaths: [foreign] });
  });
});

describe("imageSectionsForSave", () => {
  it("removes links and keeps only the portrait format marker", () => {
    const saved = imageSectionsForSave(
      sections({
        start: {
          layout: "2-spaltig",
          images: [
            image("a", { signed_url: "https://link", format: "hoch" }),
            image("b", { format: "quer" }),
          ],
        },
      }),
      doc(),
    );
    expect(saved.start.images[0]).toEqual({ ...image("a"), format: "hoch" });
    expect(saved.start.images[1]).toEqual(image("b"));
  });

  it("keeps start and end of an old chapter without positions", () => {
    const input = sections({ start: { layout: "1-spaltig", images: [image("a")] } });
    expect(imageSectionsForSave(input, doc()).start.images).toHaveLength(1);
  });

  it("drops sections the text no longer uses", () => {
    const saved = imageSectionsForSave(
      sections({
        start: { layout: "2-spaltig", images: [image("a")] },
        end: { layout: "1-spaltig", images: [image("b")] },
        inline: {
          [SECTION_A]: { layout: "1-spaltig", images: [image("c")] },
          [SECTION_B]: { layout: "1-spaltig", images: [image("d")] },
        },
        placed: true,
      }),
      doc("end", SECTION_A),
    );
    expect(saved.placed).toBe(true);
    expect(saved.start).toEqual({ layout: "2-spaltig", images: [] });
    expect(saved.end.images.map((entry) => entry.id)).toEqual(["b"]);
    expect(Object.keys(saved.inline ?? {})).toEqual([SECTION_A]);
  });

  it("writes no empty inline object", () => {
    expect(imageSectionsForSave(sections({ placed: true }), doc())).not.toHaveProperty("inline");
  });
});

describe("prepareChapterImages", () => {
  const text = { type: "paragraph", content: [{ type: "text", text: "Text" }] };
  const node = (sectionId: string) => ({ type: "imageSection", attrs: { sectionId } });
  const types = (body: unknown) =>
    (body as { content: Array<{ type: string; attrs?: { sectionId?: string } }> }).content.map(
      (block) => (block.type === "imageSection" ? block.attrs?.sectionId : block.type),
    );
  const photos = { layout: "1-spaltig" as const, images: [image("a")] };
  const more = { layout: "1-spaltig" as const, images: [image("b")] };

  it("lässt ein altes Kapitel ohne Fotos unangetastet", () => {
    const body = { type: "doc", content: [text] };
    const prepared = prepareChapterImages(body, sections());
    expect(prepared.body).toBe(body);
    expect(prepared.imageSections.placed).toBe(true);
  });

  it("setzt die Fotos alter Kapitel an Anfang und Ende", () => {
    const prepared = prepareChapterImages(
      { type: "doc", content: [text] },
      sections({ start: photos, end: more }),
    );
    expect(types(prepared.body)).toEqual(["start", "paragraph", "end", "paragraph"]);
  });

  it("ändert den gespeicherten Text nicht", () => {
    const body = { type: "doc", content: [text] };
    const before = JSON.stringify(body);
    prepareChapterImages(body, sections({ start: photos }));
    expect(JSON.stringify(body)).toBe(before);
  });

  it("bleibt bei einem fertigen Kapitel dasselbe Objekt, damit nichts gespeichert wird", () => {
    const body = { type: "doc", content: [node("start"), text, node(SECTION_A), text] };
    const prepared = prepareChapterImages(
      body,
      sections({ start: photos, inline: { [SECTION_A]: more }, placed: true }),
    );
    expect(prepared.body).toBe(body);
  });

  it("zeigt einen entfernten Abschnitt nicht wieder", () => {
    const body = { type: "doc", content: [text] };
    const prepared = prepareChapterImages(body, sections({ placed: true }));
    expect(prepared.body).toBe(body);
  });

  it("entfernt Abschnitte ohne Fotos, unbekannte und doppelte", () => {
    const body = {
      type: "doc",
      content: [node(SECTION_A), text, node(SECTION_A), text, node(SECTION_B), text, node("kaputt"), text],
    };
    const prepared = prepareChapterImages(
      body,
      sections({ inline: { [SECTION_A]: photos }, placed: true }),
    );
    expect(types(prepared.body)).toEqual([SECTION_A, "paragraph", "paragraph", "paragraph", "paragraph"]);
  });

  it("verliert kein Foto: Abschnitte ohne Platz kommen ans Ende", () => {
    const prepared = prepareChapterImages(
      { type: "doc", content: [text] },
      sections({ inline: { [SECTION_A]: photos }, placed: true }),
    );
    expect(types(prepared.body)).toEqual(["paragraph", SECTION_A, "paragraph"]);
  });

  it("trennt aufeinanderfolgende Abschnitte, auch über einen Umbruch", () => {
    const prepared = prepareChapterImages(
      { type: "doc", content: [node("start"), { type: "pageBreak" }, node(SECTION_A), text] },
      sections({ start: photos, inline: { [SECTION_A]: more }, placed: true }),
    );
    expect(types(prepared.body)).toEqual(["start", "pageBreak", "paragraph", SECTION_A, "paragraph"]);
  });

  it("legt für ein leeres altes Kapitel mit Fotos ein Dokument an", () => {
    const prepared = prepareChapterImages(null, sections({ end: photos }));
    expect(types(prepared.body)).toEqual(["end", "paragraph"]);
  });

  it("lässt ein leeres Kapitel ohne Fotos leer", () => {
    expect(prepareChapterImages(null, sections()).body).toBeNull();
  });
});

describe("withImageSection and withSignedUrls", () => {
  it("adds, changes and removes a section in the text", () => {
    const section = { layout: "1-spaltig" as const, images: [image("a")] };
    const added = withImageSection(sections({ placed: true }), SECTION_A, section);
    expect(added.inline?.[SECTION_A]).toEqual(section);
    expect(added.placed).toBe(true);
    expect(withImageSection(added, SECTION_A, null)).not.toHaveProperty("inline");
  });

  it("empties start and end instead of removing them", () => {
    const input = sections({ end: { layout: "2-spaltig", images: [image("a")] } });
    expect(withImageSection(input, "end", null).end).toEqual({ layout: "2-spaltig", images: [] });
  });

  it("signs the photos of every section", () => {
    const input = sections({
      start: { layout: "1-spaltig", images: [image("a")] },
      inline: { [SECTION_A]: { layout: "1-spaltig", images: [image("b")] } },
    });
    const signed = withSignedUrls(
      input,
      new Map([[image("b").storage_path, "https://link/b"]]),
    );
    expect(allImages(signed).map((entry) => entry.signed_url)).toEqual(["", "https://link/b"]);
  });
});
