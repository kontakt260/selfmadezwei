import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  chapterAutosaveAction,
  chapterImageUploadPrepareAction,
  chapterImageUploadCommitAction,
} from "./actions";
import type { ImageSections } from "@/lib/kapiteleditor/types";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

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
function makeUpdateBuilder() {
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
  const resolved = Promise.resolve({ data: null, error: null });
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

// ─── Bild-Upload in zwei Schritten (Fix 2026-11-20) ─────────────────────────

const IMAGE_ID = "dddddddd-dddd-4ddd-addd-dddddddddddd";

function makeUploadClient(opts: { member?: boolean; sections?: ImageSections } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: "tok", path: "p" }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: null }),
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
