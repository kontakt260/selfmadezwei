import { beforeEach, describe, expect, it, vi } from "vitest";

// PROJ-32: Schrift für das ganze Buch ändern (Spec AC-10, AC-11, AC-17).

const PROJECT = "cccccccc-0032-4032-8032-000000000032";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  member: true,
  memberError: null as { message: string } | null,
  blocked: null as string | null,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updatedRows: [{ id: "x" }] as unknown[],
  updateError: null as { message: string } | null,
}));

vi.mock("@/lib/projects/project-access", () => ({
  projectWriteBlockedError: async () => state.blocked,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: state.member ? { role: "mitschreibender" } : null,
          error: state.memberError,
        }),
        update: (values: Record<string, unknown>) => {
          state.updates.push({ table, values });
          return {
            eq: () => ({ select: async () => ({ data: state.updatedRows, error: state.updateError }) }),
          };
        },
      };
      return builder;
    },
  }),
}));

import { setBookFontAction } from "./actions";

beforeEach(() => {
  state.user = { id: "u1" };
  state.member = true;
  state.memberError = null;
  state.blocked = null;
  state.updates.length = 0;
  state.updatedRows = [{ id: "x" }];
  state.updateError = null;
});

describe("setBookFontAction", () => {
  it("speichert eine Schrift aus der Liste am Projekt", async () => {
    await expect(setBookFontAction({ projectId: PROJECT, bookFont: "baskerville" })).resolves.toEqual({
      ok: true,
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].table).toBe("projects");
    expect(state.updates[0].values).toMatchObject({ book_font: "baskerville" });
  });

  it("lehnt Schriften außerhalb der Liste ab", async () => {
    const result = await setBookFontAction({ projectId: PROJECT, bookFont: "arial" as never });
    expect(result.error).toBe("Diese Schrift gibt es nicht.");
    expect(state.updates).toHaveLength(0);
  });

  it("lehnt ungültige Projekt-IDs ab", async () => {
    const result = await setBookFontAction({ projectId: "1; drop table projects", bookFont: "heros" });
    expect(result.error).toBeTruthy();
    expect(state.updates).toHaveLength(0);
  });

  it("verlangt eine Anmeldung", async () => {
    state.user = null;
    await expect(setBookFontAction({ projectId: PROJECT, bookFont: "heros" })).resolves.toEqual({
      error: "Nicht angemeldet.",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("erlaubt nur Mitgliedern den Wechsel", async () => {
    state.member = false;
    await expect(setBookFontAction({ projectId: PROJECT, bookFont: "heros" })).resolves.toEqual({
      error: "Projekt nicht gefunden.",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("sperrt den Wechsel im Lesemodus", async () => {
    state.blocked = "Ihr Projektzugang ist abgelaufen. Bitte verlängern Sie ihn, um weiterzuarbeiten.";
    await expect(setBookFontAction({ projectId: PROJECT, bookFont: "heros" })).resolves.toEqual({
      error: state.blocked,
    });
    expect(state.updates).toHaveLength(0);
  });

  it("meldet einen Fehler in der Sie-Form, wenn das Speichern scheitert", async () => {
    state.updateError = { message: "boom" };
    await expect(setBookFontAction({ projectId: PROJECT, bookFont: "atkinson" })).resolves.toEqual({
      error: "Die Schrift konnte nicht geändert werden. Bitte versuchen Sie es erneut.",
    });
  });

  it("meldet einen Fehler, wenn die Datenbank nichts geändert hat (RLS)", async () => {
    state.updatedRows = [];
    const result = await setBookFontAction({ projectId: PROJECT, bookFont: "atkinson" });
    expect(result.error).toBe("Die Schrift konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
  });
});
