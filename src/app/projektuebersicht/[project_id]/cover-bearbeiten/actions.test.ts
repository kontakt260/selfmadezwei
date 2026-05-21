import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-dummy";

import { createClient } from "@/lib/supabase/server";
import { saveCoverAction, getCoverImageSignedUrlAction } from "./actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const OTHER_PROJECT_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const USER_ID = "11111111-1111-4111-a111-111111111111";

// ─── Builder-Mock (chainable Supabase-Builder) ───────────────────────────────

function makeBuilder(
  result: { data?: unknown; error?: { code?: string; message?: string } | null } = {},
) {
  const final = { data: result.data ?? null, error: result.error ?? null };
  const resolved = Promise.resolve(final);
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(final),
    maybeSingle: vi.fn().mockResolvedValue(final),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
}

function makeMockClient(opts: {
  user?: { id: string } | null;
  storageSignedUrl?: { data: { signedUrl: string } | null; error?: { message: string } | null };
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: USER_ID } : opts.user },
      }),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue(
          opts.storageSignedUrl ?? {
            data: { signedUrl: "https://example.com/signed/cover.jpg" },
            error: null,
          },
        ),
      }),
    },
  };
}

const VALID_INPUT = {
  projectId: PROJECT_ID,
  title: "Mein Lebensbuch",
  subtitle: "Erinnerungen aus 80 Jahren",
  authorLine: "von Maria Müller",
  themeId: "linie",
  colorId: "salbei",
  imagePath: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── saveCoverAction ─────────────────────────────────────────────────────────

describe("saveCoverAction", () => {
  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await saveCoverAction(VALID_INPUT)).toEqual({ error: "Nicht angemeldet." });
  });

  it("rejects invalid project ID format", async () => {
    const result = await saveCoverAction({ ...VALID_INPUT, projectId: "not-a-uuid" });
    expect(result.error).toBeTruthy();
  });

  it("rejects empty title (after trim)", async () => {
    const result = await saveCoverAction({ ...VALID_INPUT, title: "   " });
    expect(result.error).toBe("Titel darf nicht leer sein.");
  });

  it("rejects too-long title (> 60 chars)", async () => {
    const longTitle = "x".repeat(61);
    const result = await saveCoverAction({ ...VALID_INPUT, title: longTitle });
    expect(result.error).toBe("Titel darf maximal 60 Zeichen haben.");
  });

  it("rejects unknown theme id", async () => {
    const result = await saveCoverAction({ ...VALID_INPUT, themeId: "phantasie" });
    expect(result.error).toBe("Unbekanntes Muster.");
  });

  it("rejects unknown color id", async () => {
    const result = await saveCoverAction({ ...VALID_INPUT, colorId: "neon-pink" });
    expect(result.error).toBe("Unbekannte Farbe.");
  });

  it("rejects invalid image path format", async () => {
    const result = await saveCoverAction({
      ...VALID_INPUT,
      imagePath: "../etc/passwd",
    });
    expect(result.error).toBe("Ungültiger Bild-Pfad.");
  });

  it("rejects image path whose UUID prefix does not match projectId", async () => {
    // Shape-validates (matches the regex) but prefix UUID is a different project.
    const result = await saveCoverAction({
      ...VALID_INPUT,
      imagePath: `${OTHER_PROJECT_ID}/cover-1748000000000.jpg`,
    });
    expect(result.error).toBe("Pfad gehört nicht zum Projekt.");
  });

  it("rejects when user is not a project member", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ data: null })); // membership-check
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await saveCoverAction(VALID_INPUT);
    expect(result.error).toBe("Projekt nicht gefunden.");
  });

  it("happy path: UPSERT cover + return updatedAt", async () => {
    const client = makeMockClient();
    client.from
      // 1. project_members .select.eq.eq.single
      .mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }))
      // 2. projects .select.eq.single (Titel-Check)
      .mockReturnValueOnce(makeBuilder({ data: { title: "Mein Lebensbuch" } }))
      // 3. project_covers .upsert.select.single
      .mockReturnValueOnce(makeBuilder({ data: { updated_at: "2026-05-22T10:30:00Z" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await saveCoverAction(VALID_INPUT);
    expect(result.error).toBeUndefined();
    expect(result.updatedAt).toBe("2026-05-22T10:30:00Z");
  });

  it("updates projects.title only when changed", async () => {
    const client = makeMockClient();
    const titleUpdateBuilder = makeBuilder({ data: null });
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { role: "projektleiter" } }))
      .mockReturnValueOnce(makeBuilder({ data: { title: "Alter Titel" } }))
      .mockReturnValueOnce(titleUpdateBuilder) // projects update
      .mockReturnValueOnce(makeBuilder({ data: { updated_at: "2026-05-22T10:30:00Z" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await saveCoverAction({ ...VALID_INPUT, title: "Neuer Titel" });
    expect(result.error).toBeUndefined();
    expect(titleUpdateBuilder.update).toHaveBeenCalledWith({ title: "Neuer Titel" });
  });

  it("accepts well-formed storage path", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }))
      .mockReturnValueOnce(makeBuilder({ data: { title: "Mein Lebensbuch" } }))
      .mockReturnValueOnce(makeBuilder({ data: { updated_at: "2026-05-22T10:30:00Z" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await saveCoverAction({
      ...VALID_INPUT,
      imagePath: `${PROJECT_ID}/cover-1748000000000.jpg`,
    });
    expect(result.error).toBeUndefined();
  });

  it("normalises multi-line title to single line", async () => {
    const client = makeMockClient();
    const upsertBuilder = makeBuilder({ data: { updated_at: "2026-05-22T10:30:00Z" } });
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }))
      .mockReturnValueOnce(makeBuilder({ data: { title: "Aus Word\nMit Umbruch" } }))
      .mockReturnValueOnce(makeBuilder({ data: null })) // projects update
      .mockReturnValueOnce(upsertBuilder);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await saveCoverAction({ ...VALID_INPUT, title: "  Mehrere   Spaces  " });
    expect(result.error).toBeUndefined();
    // Trim + Whitespace-Normalisierung sind in Zod-Pipeline
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        theme: "linie",
        metadata: expect.objectContaining({
          background_color: "salbei",
          schema_version: 1,
        }),
      }),
      { onConflict: "project_id" },
    );
  });
});

// ─── getCoverImageSignedUrlAction ────────────────────────────────────────────

describe("getCoverImageSignedUrlAction", () => {
  const VALID_PATH = `${PROJECT_ID}/cover-1748000000000.jpg`;

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(
      await getCoverImageSignedUrlAction({ projectId: PROJECT_ID, imagePath: VALID_PATH }),
    ).toEqual({ error: "Nicht angemeldet." });
  });

  it("rejects path that does not belong to the project", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never);
    const result = await getCoverImageSignedUrlAction({
      projectId: PROJECT_ID,
      imagePath: `${OTHER_PROJECT_ID}/cover-1.jpg`,
    });
    expect(result.error).toBe("Pfad gehört nicht zum Projekt.");
  });

  it("rejects when user is not a project member", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ data: null }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await getCoverImageSignedUrlAction({
      projectId: PROJECT_ID,
      imagePath: VALID_PATH,
    });
    expect(result.error).toBe("Projekt nicht gefunden.");
  });

  it("returns signedUrl on happy path", async () => {
    const client = makeMockClient({
      storageSignedUrl: {
        data: { signedUrl: "https://example.com/signed/foo.jpg?token=abc" },
        error: null,
      },
    });
    client.from.mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getCoverImageSignedUrlAction({
      projectId: PROJECT_ID,
      imagePath: VALID_PATH,
    });
    expect(result.error).toBeUndefined();
    expect(result.signedUrl).toBe("https://example.com/signed/foo.jpg?token=abc");
  });

  it("translates storage error into user-readable message", async () => {
    const client = makeMockClient({
      storageSignedUrl: { data: null, error: { message: "Object not found" } },
    });
    client.from.mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getCoverImageSignedUrlAction({
      projectId: PROJECT_ID,
      imagePath: VALID_PATH,
    });
    expect(result.error).toBe("Vorschau-URL konnte nicht erzeugt werden.");
  });
});
