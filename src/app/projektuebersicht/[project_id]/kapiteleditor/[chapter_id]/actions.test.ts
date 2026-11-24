import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  chapterAutosaveAction,
  chapterImageDeleteAction,
  chapterImageLinksAction,
  chapterImageUploadPrepareAction,
  chapterImageUploadCommitAction,
} from "./actions";
import type { ImageSections } from "@/lib/kapiteleditor/types";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const projectWriteBlockedErrorMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/lib/projects/project-access", () => ({
  projectWriteBlockedError: projectWriteBlockedErrorMock,
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CHAPTER_ID = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const USER_ID    = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

const EMPTY_SECTIONS: ImageSections = {
  start: { layout: "1-spaltig", images: [] },
  end:   { layout: "1-spaltig", images: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Records the last `.update(payload)` call on chapters so tests can assert
 * which fields were sent — central in PROJ-7 (page_count must show up when
 * provided, must NOT show up when omitted).
 */
function makeUpdateBuilder(savedRows: Array<{ id: string }> = [{ id: CHAPTER_ID }]) {
  const lastPayload: { value: Record<string, unknown> | null } = { value: null };
  const builder: Record<string, unknown> = {
    update: vi.fn((payload: Record<string, unknown>) => {
      lastPayload.value = payload;
      return builder;
    }),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const resolved = Promise.resolve({ data: savedRows, error: null });
  (builder.then as unknown) = resolved.then.bind(resolved);
  return { builder, lastPayload };
}

function makeMockClient(user: { id: string } | null = { id: USER_ID }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(),
  };
}

function baseInput(overrides: Partial<Parameters<typeof chapterAutosaveAction>[0]> = {}) {
  return {
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    title: "Mein Kapitel",
    body: { type: "doc", content: [] },
    imageSections: EMPTY_SECTIONS,
    colorPageCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Auth + Validation ────────────────────────────────────────────────────────

describe("chapterAutosaveAction — auth + validation", () => {
  it("returns error when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient(null) as never);
    expect(await chapterAutosaveAction(baseInput())).toEqual({ error: "Nicht angemeldet." });
  });

  it("rejects empty title", async () => {
    const res = await chapterAutosaveAction(baseInput({ title: "" }));
    expect(res.error).toBeTruthy();
  });

  it("rejects invalid chapter UUID", async () => {
    const res = await chapterAutosaveAction(baseInput({ chapterId: "not-a-uuid" }));
    expect(res.error).toBeTruthy();
  });

  it("rejects pageCount = 0", async () => {
    const res = await chapterAutosaveAction(baseInput({ pageCount: 0 }));
    expect(res.error).toBeTruthy();
  });

  it("rejects pageCount = 1000 (above range)", async () => {
    const res = await chapterAutosaveAction(baseInput({ pageCount: 1000 }));
    expect(res.error).toBeTruthy();
  });

  it("rejects negative pageCount", async () => {
    const res = await chapterAutosaveAction(baseInput({ pageCount: -5 }));
    expect(res.error).toBeTruthy();
  });
});

// ─── page_count Payload-Verhalten (PROJ-7 Kern-AC) ───────────────────────────

describe("chapterAutosaveAction — deleted chapter (PROJ-26)", () => {
  it("reports an error instead of success when the chapter is gone", async () => {
    const client = makeMockClient();
    const { builder } = makeUpdateBuilder([]);
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await chapterAutosaveAction(baseInput())).toEqual({
      error: "Speichern fehlgeschlagen.",
    });
  });
});

describe("chapterAutosaveAction — page_count payload", () => {
  it("includes page_count in DB update when client sends it", async () => {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterAutosaveAction(baseInput({ pageCount: 7 }));
    expect(res).toEqual({ ok: true });
    expect(lastPayload.value?.page_count).toBe(7);
  });

  it("OMITS page_count from DB update when client doesn't send it (alter Build → kein Reset auf 1)", async () => {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterAutosaveAction(baseInput()); // no pageCount
    expect(res).toEqual({ ok: true });
    expect(lastPayload.value).not.toBeNull();
    expect("page_count" in (lastPayload.value as object)).toBe(false);
  });

  it("accepts pageCount = 1 (range minimum)", async () => {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterAutosaveAction(baseInput({ pageCount: 1 }));
    expect(res).toEqual({ ok: true });
    expect(lastPayload.value?.page_count).toBe(1);
  });

  it("accepts pageCount = 999 (range maximum)", async () => {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterAutosaveAction(baseInput({ pageCount: 999 }));
    expect(res).toEqual({ ok: true });
    expect(lastPayload.value?.page_count).toBe(999);
  });
});

// ─── Übrige Save-Felder bleiben unverändert ──────────────────────────────────

describe("chapterAutosaveAction — existing fields untouched", () => {
  it("sends title, body, image_sections, color_page_count regardless of pageCount", async () => {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterAutosaveAction(
      baseInput({ title: "Hello World", colorPageCount: 3, pageCount: 4 }),
    );
    expect(res).toEqual({ ok: true });
    expect(lastPayload.value?.title).toBe("Hello World");
    expect(lastPayload.value?.color_page_count).toBe(3);
    expect(lastPayload.value?.page_count).toBe(4);
    expect(lastPayload.value).toHaveProperty("body");
    expect(lastPayload.value).toHaveProperty("image_sections");
    expect(lastPayload.value).toHaveProperty("updated_at");
  });
});

// ─── Abgelaufener Zugang (BUG-G6) ────────────────────────────────────────────

describe("abgelaufenes Projekt darf nicht bearbeitet werden", () => {
  const blocked = "Ihr Projektzugang für dieses Projekt ist abgelaufen.";

  it("Auto-Save wird abgelehnt, ohne zu schreiben", async () => {
    const client = makeMockClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    projectWriteBlockedErrorMock.mockResolvedValueOnce(blocked);
    expect(await chapterAutosaveAction(baseInput())).toEqual({ error: blocked });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("Bild-Upload bekommt keinen Upload-Link", async () => {
    const { client, storage } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    projectWriteBlockedErrorMock.mockResolvedValueOnce(blocked);
    const res = await chapterImageUploadPrepareAction({
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      section: "start",
      contentType: "image/jpeg",
      size: 1000,
    });
    expect(res.error).toBe(blocked);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

// ─── Bild-Upload in zwei Schritten (Fix 2026-11-20) ─────────────────────────

const IMAGE_ID = "dddddddd-dddd-4ddd-addd-dddddddddddd";

function makeUploadClient(opts: { member?: boolean; sections?: ImageSections } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: "tok", path: "p" }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: null }),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
      error: null,
    })),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
    storage: { from: vi.fn(() => storage) },
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return b;
      });
      b.single = vi.fn().mockResolvedValue(
        table === "project_members"
          ? { data: opts.member === false ? null : { role: "projektleiter" }, error: null }
          : { data: { image_sections: opts.sections ?? EMPTY_SECTIONS }, error: null },
      );
      b.maybeSingle = b.single;
      const done = Promise.resolve({ data: null, error: null });
      b.then = done.then.bind(done);
      return b;
    }),
  };
  return { client, storage, updates };
}

describe("chapterImageUploadPrepareAction", () => {
  const input = { projectId: PROJECT_ID, chapterId: CHAPTER_ID, section: "start" as const, contentType: "image/jpeg", size: 5_000_000 };

  it("issues a signed upload link for a 5 MB photo — no 1 MB limit any more", async () => {
    const { client, storage } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await chapterImageUploadPrepareAction(input);
    expect(res.error).toBeUndefined();
    expect(res.upload?.token).toBe("tok");
    expect(res.upload?.storagePath).toMatch(new RegExp(`^${PROJECT_ID}/${CHAPTER_ID}/[0-9a-f-]{36}\\.jpg$`));
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(res.upload?.storagePath);
  });

  it("rejects files over 10 MB and non-image types", async () => {
    expect((await chapterImageUploadPrepareAction({ ...input, size: 11 * 1024 * 1024 })).error).toBe("Datei zu groß. Maximum 10 MB.");
    expect((await chapterImageUploadPrepareAction({ ...input, contentType: "application/pdf" })).error).toBe("Nur JPEG, PNG oder WebP erlaubt.");
  });

  it("refuses non-members", async () => {
    const { client, storage } = makeUploadClient({ member: false });
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect((await chapterImageUploadPrepareAction(input)).error).toBe("Projekt nicht gefunden.");
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("chapterImageUploadCommitAction", () => {
  const path = `${PROJECT_ID}/${CHAPTER_ID}/${IMAGE_ID}.jpg`;
  const input = { projectId: PROJECT_ID, chapterId: CHAPTER_ID, section: "end" as const, imageId: IMAGE_ID, storagePath: path };

  it("adds the uploaded image to the section and returns a signed URL", async () => {
    const { client, updates } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await chapterImageUploadCommitAction(input);
    expect(res.image).toMatchObject({ id: IMAGE_ID, storage_path: path, signed_url: "https://signed/x" });
    const saved = updates[0].image_sections as ImageSections;
    expect(saved.end.images.map((i) => i.id)).toEqual([IMAGE_ID]);
    expect(saved.start.images).toEqual([]);
  });

  it("rejects a path outside the own chapter folder", async () => {
    const res = await chapterImageUploadCommitAction({
      ...input,
      storagePath: `eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee/${CHAPTER_ID}/${IMAGE_ID}.jpg`,
    });
    expect(res.error).toBe("Ungültiger Speicherpfad.");
  });

  it("fails when the file never reached the bucket", async () => {
    const { client, storage, updates } = makeUploadClient();
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect((await chapterImageUploadCommitAction(input)).error).toBe("Upload fehlgeschlagen.");
    expect(updates).toHaveLength(0);
  });

  it("does not add the image twice when called again", async () => {
    const sections: ImageSections = {
      start: { layout: "1-spaltig", images: [] },
      end: { layout: "1-spaltig", images: [{ id: IMAGE_ID, storage_path: path, signed_url: "", alt: "" }] },
    };
    const { client, updates } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect((await chapterImageUploadCommitAction(input)).image?.id).toBe(IMAGE_ID);
    expect(updates).toHaveLength(0);
  });
});

// ─── Bildabschnitte an jeder Textstelle (PROJ-34) ───────────────────────────

const SECTION_ID = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
const OTHER_SECTION_ID = "ffffffff-ffff-4fff-afff-ffffffffffff";

function photo(name: string, format?: "hoch") {
  return {
    id: name,
    storage_path: `${PROJECT_ID}/${CHAPTER_ID}/${name}.jpg`,
    signed_url: "",
    alt: "",
    ...(format ? { format } : {}),
  };
}

function photos(count: number, prefix = "foto") {
  return Array.from({ length: count }, (_, index) => photo(`${prefix}-${index}`));
}

function bodyWith(...sectionIds: string[]) {
  return {
    type: "doc",
    content: sectionIds.map((sectionId) => ({ type: "imageSection", attrs: { sectionId } })),
  };
}

function placedSections(): ImageSections {
  return {
    ...EMPTY_SECTIONS,
    inline: { [SECTION_ID]: { layout: "1-spaltig", images: [photo("a", "hoch")] } },
    placed: true,
  };
}

describe("chapterAutosaveAction — Bildabschnitte", () => {
  function savingClient() {
    const client = makeMockClient();
    const { builder, lastPayload } = makeUpdateBuilder();
    client.from.mockReturnValue(builder);
    vi.mocked(createClient).mockResolvedValue(client as never);
    return { client, builder, lastPayload };
  }

  it("stores sections in the text with their format, without links", async () => {
    const { lastPayload } = savingClient();
    const imageSections = placedSections();
    imageSections.inline![SECTION_ID].images[0].signed_url = "https://signed/alt";

    const res = await chapterAutosaveAction(
      baseInput({ body: bodyWith(SECTION_ID), imageSections }),
    );

    expect(res).toEqual({ ok: true });
    const saved = lastPayload.value?.image_sections as ImageSections;
    expect(saved.placed).toBe(true);
    expect(saved.inline?.[SECTION_ID].images[0]).toEqual(photo("a", "hoch"));
  });

  it("drops the photos of a section the text no longer uses", async () => {
    const { lastPayload } = savingClient();

    await chapterAutosaveAction(baseInput({ body: bodyWith(), imageSections: placedSections() }));

    expect(lastPayload.value?.image_sections).toEqual({ ...EMPTY_SECTIONS, placed: true });
  });

  it("refuses a section that stands twice in the text and writes nothing", async () => {
    const { builder } = savingClient();

    const res = await chapterAutosaveAction(
      baseInput({ body: bodyWith(SECTION_ID, SECTION_ID), imageSections: placedSections() }),
    );

    expect(res.error).toBe("Ein Bildabschnitt darf nur einmal im Text stehen.");
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown section in the text", async () => {
    savingClient();
    const res = await chapterAutosaveAction(
      baseInput({ body: bodyWith(OTHER_SECTION_ID), imageSections: placedSections() }),
    );
    expect(res.error).toBe("Der Text enthält einen unbekannten Bildabschnitt.");
  });

  it("refuses more than 60 photos in a section with a German message", async () => {
    savingClient();
    const res = await chapterAutosaveAction(
      baseInput({
        imageSections: { ...EMPTY_SECTIONS, start: { layout: "1-spaltig", images: photos(61) } },
      }),
    );
    expect(res.error).toBe("Ein Bildabschnitt kann höchstens 60 Fotos enthalten.");
  });

  it("refuses more than 120 photos in a chapter", async () => {
    savingClient();
    const res = await chapterAutosaveAction(
      baseInput({
        imageSections: {
          start: { layout: "1-spaltig", images: photos(60, "a") },
          end: { layout: "1-spaltig", images: photos(60, "b") },
          inline: { [SECTION_ID]: { layout: "1-spaltig", images: [photo("c")] } },
        },
      }),
    );
    expect(res.error).toBe("Ein Kapitel kann höchstens 120 Fotos enthalten.");
  });

  it("refuses a new file path from another project", async () => {
    const { builder } = savingClient();
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: { image_sections: EMPTY_SECTIONS },
      error: null,
    });
    const foreign = { ...photo("x"), storage_path: `${OTHER_SECTION_ID}/${CHAPTER_ID}/x.jpg` };

    const res = await chapterAutosaveAction(
      baseInput({ imageSections: { ...EMPTY_SECTIONS, start: { layout: "1-spaltig", images: [foreign] } } }),
    );

    expect(res.error).toBe("Ungültiger Speicherpfad.");
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("keeps an old chapter saveable when the path was already stored", async () => {
    const { builder, lastPayload } = savingClient();
    const legacy = { ...photo("alt"), storage_path: `${PROJECT_ID}/altes-format/alt.jpg` };
    const imageSections = { ...EMPTY_SECTIONS, start: { layout: "1-spaltig" as const, images: [legacy] } };
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: { image_sections: imageSections },
      error: null,
    });

    expect(await chapterAutosaveAction(baseInput({ imageSections }))).toEqual({ ok: true });
    expect((lastPayload.value?.image_sections as ImageSections).start.images[0].storage_path).toBe(
      legacy.storage_path,
    );
  });
});

describe("Upload in Bildabschnitte im Text", () => {
  const path = `${PROJECT_ID}/${CHAPTER_ID}/${IMAGE_ID}.jpg`;
  const input = {
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    section: SECTION_ID,
    imageId: IMAGE_ID,
    storagePath: path,
  };

  it("creates the section with its first photo and format", async () => {
    const { client, updates } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterImageUploadCommitAction({ ...input, format: "hoch" });

    expect(res.image).toMatchObject({ id: IMAGE_ID, format: "hoch" });
    const saved = updates[0].image_sections as ImageSections;
    expect(saved.inline?.[SECTION_ID]).toEqual({
      layout: "1-spaltig",
      images: [{ id: IMAGE_ID, storage_path: path, signed_url: "", alt: "", format: "hoch" }],
    });
  });

  it("keeps the other sections and the position marker", async () => {
    const sections: ImageSections = {
      ...placedSections(),
      start: { layout: "2-spaltig", images: [photo("start")] },
    };
    const { client, updates } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await chapterImageUploadCommitAction({ ...input, section: OTHER_SECTION_ID });

    const saved = updates[0].image_sections as ImageSections;
    expect(saved.placed).toBe(true);
    expect(saved.start.images).toHaveLength(1);
    expect(Object.keys(saved.inline ?? {}).sort()).toEqual([SECTION_ID, OTHER_SECTION_ID].sort());
  });

  it("refuses an invalid section id", async () => {
    const res = await chapterImageUploadCommitAction({ ...input, section: "__proto__" });
    expect(res.error).toBe("Ungültiger Bildabschnitt.");
  });

  it("gives no upload link once the section is full", async () => {
    const sections: ImageSections = {
      ...EMPTY_SECTIONS,
      inline: { [SECTION_ID]: { layout: "1-spaltig", images: photos(60) } },
    };
    const { client, storage } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterImageUploadPrepareAction({
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      section: SECTION_ID,
      contentType: "image/jpeg",
      size: 1000,
    });

    expect(res.error).toBe("Ein Bildabschnitt kann höchstens 60 Fotos enthalten.");
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the chapter filled up meanwhile", async () => {
    const sections: ImageSections = {
      start: { layout: "1-spaltig", images: photos(60, "a") },
      end: { layout: "1-spaltig", images: photos(60, "b") },
    };
    const { client, storage, updates } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await chapterImageUploadCommitAction(input);

    expect(res.error).toBe("Ein Kapitel kann höchstens 120 Fotos enthalten.");
    expect(storage.remove).toHaveBeenCalledWith([path]);
    expect(updates).toHaveLength(0);
  });
});

describe("chapterImageDeleteAction", () => {
  const input = { projectId: PROJECT_ID, chapterId: CHAPTER_ID, section: SECTION_ID, imageId: "a" };

  it("removes the photo but leaves the file for the delayed cleanup", async () => {
    const sections = placedSections();
    sections.inline![SECTION_ID].images.push(photo("b"));
    const { client, storage, updates } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await chapterImageDeleteAction(input)).toEqual({ ok: true });

    const saved = updates[0].image_sections as ImageSections;
    expect(saved.inline?.[SECTION_ID].images.map((i) => i.id)).toEqual(["b"]);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes a section in the text with its last photo", async () => {
    const { client, updates } = makeUploadClient({ sections: placedSections() });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await chapterImageDeleteAction(input);

    expect(updates[0].image_sections).toEqual({ ...EMPTY_SECTIONS, placed: true });
  });

  it("keeps the start section as an empty record", async () => {
    const sections: ImageSections = {
      ...EMPTY_SECTIONS,
      start: { layout: "2-spaltig", images: [photo("a")] },
    };
    const { client, updates } = makeUploadClient({ sections });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await chapterImageDeleteAction({ ...input, section: "start" });

    expect((updates[0].image_sections as ImageSections).start).toEqual({
      layout: "2-spaltig",
      images: [],
    });
  });

  it("reports an unknown photo", async () => {
    const { client, updates } = makeUploadClient({ sections: placedSections() });
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect((await chapterImageDeleteAction({ ...input, imageId: "fehlt" })).error).toBe(
      "Bild nicht gefunden.",
    );
    expect(updates).toHaveLength(0);
  });

  it("is blocked for an expired project", async () => {
    const { client, updates } = makeUploadClient({ sections: placedSections() });
    vi.mocked(createClient).mockResolvedValue(client as never);
    projectWriteBlockedErrorMock.mockResolvedValueOnce("Abgelaufen.");

    expect((await chapterImageDeleteAction(input)).error).toBe("Abgelaufen.");
    expect(updates).toHaveLength(0);
  });
});

describe("chapterImageLinksAction", () => {
  const file = `${PROJECT_ID}/${CHAPTER_ID}/foto.jpg`;
  const input = { projectId: PROJECT_ID, chapterId: CHAPTER_ID, paths: [file] };

  it("also signs older photos from another folder of the same project", async () => {
    const { client } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    const older = `${PROJECT_ID}/${OTHER_SECTION_ID}/alt.png`;
    const res = await chapterImageLinksAction({ ...input, paths: [older] });
    expect(res.links?.[older]).toBeTruthy();
  });

  it("returns fresh links for files of this chapter", async () => {
    const { client, storage } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await chapterImageLinksAction(input)).toEqual({
      links: { [file]: `https://signed/${file}` },
    });
    expect(storage.createSignedUrls).toHaveBeenCalledWith([file], 3600);
  });

  it("also works for an expired project in reading mode", async () => {
    const { client } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    projectWriteBlockedErrorMock.mockResolvedValue("Abgelaufen.");

    const res = await chapterImageLinksAction(input);

    projectWriteBlockedErrorMock.mockResolvedValue(null);
    expect(res.links?.[file]).toBeTruthy();
  });

  it("refuses files outside the project folder before asking the server", async () => {
    const { client, storage } = makeUploadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    for (const path of [
      `${OTHER_SECTION_ID}/${CHAPTER_ID}/foto.jpg`,
      `${PROJECT_ID}/${CHAPTER_ID}/../foto.jpg`,
      `${PROJECT_ID}/../${OTHER_SECTION_ID}/foto.jpg`,
    ]) {
      expect((await chapterImageLinksAction({ ...input, paths: [path] })).error).toBe(
        "Ungültiger Speicherpfad.",
      );
    }
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("refuses non-members", async () => {
    const { client, storage } = makeUploadClient({ member: false });
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect((await chapterImageLinksAction(input)).error).toBe("Projekt nicht gefunden.");
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("requires a login", async () => {
    const { client, storage } = makeUploadClient();
    client.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect((await chapterImageLinksAction(input)).error).toBe("Nicht angemeldet.");
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("refuses more than 120 paths", async () => {
    const res = await chapterImageLinksAction({
      ...input,
      paths: Array.from({ length: 121 }, (_, index) => `${PROJECT_ID}/${CHAPTER_ID}/${index}.jpg`),
    });
    expect(res.error).toBeTruthy();
  });
});
