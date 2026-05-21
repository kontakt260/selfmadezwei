import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deleteProjectAction,
  addChapterAction,
  addImpulseChapterAction,
  renameChapterAction,
  deleteChapterAction,
  saveChapterOrderAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CHAPTER_1  = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const CHAPTER_2  = "dddddddd-dddd-4ddd-addd-dddddddddddd";
const USER_ID    = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A chainable Supabase query builder stub. Supports both terminal calls
 * (.single(), .maybeSingle()) and direct await via .then/.catch/.finally.
 */
function makeBuilder(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = Promise.resolve({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  const b: Record<string, unknown> = {
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then:        resolved.then.bind(resolved),
    catch:       resolved.catch.bind(resolved),
    finally:     resolved.finally.bind(resolved),
  };
  return b as ReturnType<typeof vi.fn> & typeof b;
}

function makeMockClient(user: { id: string } | null = { id: USER_ID }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      updateUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── deleteProjectAction ───────────────────────────────────────────────────────

describe("deleteProjectAction", () => {
  it("returns error for invalid project UUID", async () => {
    expect(await deleteProjectAction("not-a-uuid")).toEqual({ error: "Ungültige Projekt-ID." });
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteProjectAction(PROJECT_ID)).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns error when user is not a member of the project", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ data: null }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteProjectAction(PROJECT_ID)).toEqual({ error: "Projekt nicht gefunden." });
  });

  it("returns error for co_author role", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ data: { role: "co_author" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteProjectAction(PROJECT_ID)).toEqual({ error: "Keine Berechtigung zum Löschen." });
  });

  it("returns error when DB delete fails", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { role: "projektleiter" } }))
      .mockReturnValueOnce(makeBuilder({ error: { message: "db error" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteProjectAction(PROJECT_ID)).toEqual({
      error: "Projekt konnte nicht gelöscht werden.",
    });
  });

  it("returns {} and revalidates / on success", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { role: "projektleiter" } }))
      .mockReturnValueOnce(makeBuilder());
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteProjectAction(PROJECT_ID)).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

// ─── addChapterAction ──────────────────────────────────────────────────────────

describe("addChapterAction", () => {
  function fd(overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set("title", overrides.title ?? "Mein Kapitel");
    form.set("projectId", overrides.projectId ?? PROJECT_ID);
    return form;
  }

  it("returns error for empty title", async () => {
    expect((await addChapterAction(fd({ title: "" }))).error).toBeTruthy();
  });

  it("returns error for title exceeding 200 characters", async () => {
    expect((await addChapterAction(fd({ title: "A".repeat(201) }))).error).toBeTruthy();
  });

  it("returns error for invalid project UUID", async () => {
    expect((await addChapterAction(fd({ projectId: "bad-uuid" }))).error).toBeTruthy();
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await addChapterAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("inserts with sort_order 0 when no chapters exist", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: null }))               // max sort_order → null
      .mockReturnValueOnce(makeBuilder({ data: { id: CHAPTER_1 } })) // insert
      .mockReturnValueOnce(makeBuilder());                             // project updated_at touch
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await addChapterAction(fd());

    expect(result).toEqual({ chapterId: CHAPTER_1 });
    expect(client.from.mock.results[1].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sort_order: 0, chapter_origin: "custom" }),
    );
  });

  it("inserts with sort_order = last + 1 when chapters exist", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { sort_order: 4 } })) // last chapter
      .mockReturnValueOnce(makeBuilder({ data: { id: CHAPTER_1 } })) // insert
      .mockReturnValueOnce(makeBuilder());                             // project touch
    vi.mocked(createClient).mockResolvedValue(client as never);

    await addChapterAction(fd());

    expect(client.from.mock.results[1].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sort_order: 5 }),
    );
  });

  it("returns error when insert fails", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: null }))
      .mockReturnValueOnce(makeBuilder({ data: null, error: { message: "insert failed" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await addChapterAction(fd())).toEqual({
      error: "Kapitel konnte nicht angelegt werden.",
    });
  });
});

// ─── addImpulseChapterAction ───────────────────────────────────────────────────

describe("addImpulseChapterAction", () => {
  it("inserts with chapter_origin 'catalog_impulse' and source_impulse_id null when no impulseId given (backward compat)", async () => {
    const client = makeMockClient();
    const form = new FormData();
    form.set("title", "Ein Impuls-Titel");
    form.set("projectId", PROJECT_ID);
    client.from
      .mockReturnValueOnce(makeBuilder({ data: null })) // sort_order lookup
      .mockReturnValueOnce(makeBuilder({ data: { id: CHAPTER_1 } })) // chapter insert
      .mockReturnValueOnce(makeBuilder()); // projects update
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await addImpulseChapterAction(form);

    expect(result).toEqual({ chapterId: CHAPTER_1 });
    expect(client.from.mock.results[1].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ chapter_origin: "catalog_impulse", source_impulse_id: null }),
    );
  });

  it("PROJ-8: writes source_impulse_id when valid impulseId is provided", async () => {
    const IMPULSE_UUID = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
    const client = makeMockClient();
    const form = new FormData();
    form.set("title", "Kindheit");
    form.set("projectId", PROJECT_ID);
    form.set("impulseId", IMPULSE_UUID);
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { id: IMPULSE_UUID } })) // impulse exists check
      .mockReturnValueOnce(makeBuilder({ data: null })) // sort_order lookup
      .mockReturnValueOnce(makeBuilder({ data: { id: CHAPTER_1 } })) // chapter insert
      .mockReturnValueOnce(makeBuilder()); // projects update
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await addImpulseChapterAction(form);
    expect(result).toEqual({ chapterId: CHAPTER_1 });
    expect(client.from.mock.results[2].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_impulse_id: IMPULSE_UUID }),
    );
  });

  it("PROJ-8: returns error for malformed impulseId (non-UUID)", async () => {
    const form = new FormData();
    form.set("title", "Impuls");
    form.set("projectId", PROJECT_ID);
    form.set("impulseId", "kindheit-erinnerungen"); // slug instead of UUID
    expect(await addImpulseChapterAction(form)).toEqual({ error: "Ungültige Impuls-ID." });
  });

  it("PROJ-8: returns error when impulse does not exist in catalog", async () => {
    const NON_EXISTENT = "ffffffff-ffff-4fff-afff-ffffffffffff";
    const client = makeMockClient();
    const form = new FormData();
    form.set("title", "Impuls");
    form.set("projectId", PROJECT_ID);
    form.set("impulseId", NON_EXISTENT);
    client.from.mockReturnValueOnce(makeBuilder({ data: null })); // impulse lookup → null
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await addImpulseChapterAction(form)).toEqual({
      error: "Erzähl-Impuls nicht gefunden.",
    });
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    const form = new FormData();
    form.set("title", "Impuls");
    form.set("projectId", PROJECT_ID);
    expect(await addImpulseChapterAction(form)).toEqual({ error: "Nicht angemeldet." });
  });
});

// ─── renameChapterAction ───────────────────────────────────────────────────────

describe("renameChapterAction", () => {
  function fd(overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set("chapterId", overrides.chapterId ?? CHAPTER_1);
    form.set("title", overrides.title ?? "Neuer Titel");
    form.set("projectId", overrides.projectId ?? PROJECT_ID);
    return form;
  }

  it("returns error for empty title", async () => {
    expect((await renameChapterAction(fd({ title: "" }))).error).toBeTruthy();
  });

  it("returns error for title exceeding 200 characters", async () => {
    expect((await renameChapterAction(fd({ title: "B".repeat(201) }))).error).toBeTruthy();
  });

  it("returns error for invalid chapterId UUID", async () => {
    expect((await renameChapterAction(fd({ chapterId: "bad-id" }))).error).toBeTruthy();
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await renameChapterAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns error when DB update fails", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ error: { message: "not found" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await renameChapterAction(fd())).toEqual({
      error: "Kapitel konnte nicht umbenannt werden.",
    });
  });

  it("returns {} and revalidates projektuebersicht path on success", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder());
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await renameChapterAction(fd())).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith(`/projektuebersicht/${PROJECT_ID}`);
  });
});

// ─── deleteChapterAction ───────────────────────────────────────────────────────

describe("deleteChapterAction", () => {
  function fd(overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set("chapterId", overrides.chapterId ?? CHAPTER_1);
    form.set("projectId", overrides.projectId ?? PROJECT_ID);
    return form;
  }

  it("returns error for invalid chapterId UUID", async () => {
    expect((await deleteChapterAction(fd({ chapterId: "bad" }))).error).toBeTruthy();
  });

  it("returns error for invalid projectId UUID", async () => {
    expect((await deleteChapterAction(fd({ projectId: "bad" }))).error).toBeTruthy();
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteChapterAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns {} and revalidates on success", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder());
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await deleteChapterAction(fd())).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith(`/projektuebersicht/${PROJECT_ID}`);
  });
});

// ─── saveChapterOrderAction ────────────────────────────────────────────────────

describe("saveChapterOrderAction", () => {
  function fd(overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set("projectId", overrides.projectId ?? PROJECT_ID);
    form.set("orderedIds", overrides.orderedIds ?? JSON.stringify([CHAPTER_1, CHAPTER_2]));
    return form;
  }

  it("returns error for non-JSON orderedIds", async () => {
    expect((await saveChapterOrderAction(fd({ orderedIds: "not-json" }))).error).toBeTruthy();
  });

  it("returns error when orderedIds contains non-UUIDs", async () => {
    const form = fd({ orderedIds: JSON.stringify(["not-a-uuid"]) });
    expect((await saveChapterOrderAction(form)).error).toBeTruthy();
  });

  it("returns error for invalid projectId UUID", async () => {
    const form = fd({ projectId: "bad-uuid" });
    expect((await saveChapterOrderAction(form)).error).toBeTruthy();
  });

  it("returns error when not authenticated", async () => {
    const client = makeMockClient(null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await saveChapterOrderAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns security error when submitted count does not match DB", async () => {
    const client = makeMockClient();
    // DB has only 1 chapter; client submits 2
    client.from.mockReturnValueOnce(makeBuilder({ data: [{ id: CHAPTER_1 }] }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await saveChapterOrderAction(fd())).toEqual({
      error: "Sicherheitsfehler: Ungültige Kapitel-IDs.",
    });
  });

  it("returns security error when submitted list contains a foreign chapter ID", async () => {
    const FOREIGN = "ffffffff-ffff-4fff-afff-ffffffffffff";
    const client = makeMockClient();
    client.from.mockReturnValueOnce(
      makeBuilder({ data: [{ id: CHAPTER_1 }, { id: CHAPTER_2 }] }),
    );
    vi.mocked(createClient).mockResolvedValue(client as never);
    const form = fd({ orderedIds: JSON.stringify([CHAPTER_1, FOREIGN]) });
    expect(await saveChapterOrderAction(form)).toEqual({
      error: "Sicherheitsfehler: Ungültige Kapitel-IDs.",
    });
  });

  it("returns {} and performs bulk sort_order update on success", async () => {
    const client = makeMockClient();
    const updateBuilder = makeBuilder();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: [{ id: CHAPTER_1 }, { id: CHAPTER_2 }] }))
      .mockReturnValue(updateBuilder); // fallback for both chapter update calls
    vi.mocked(createClient).mockResolvedValue(client as never);

    expect(await saveChapterOrderAction(fd())).toEqual({});
    expect(client.from).toHaveBeenCalledTimes(3); // 1 select + 2 updates
    expect(revalidatePath).toHaveBeenCalledWith(`/projektuebersicht/${PROJECT_ID}`);
  });
});
