import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  PROJECT_EXPIRED_ERROR,
  accessResultIsReadOnly,
  isAccessExpired,
  isProjectReadOnly,
  projectWriteBlockedError,
} from "./project-access";

const ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

function client(result: { data: { expires_at: string | null } | null; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
}

describe("isAccessExpired", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  it("unterscheidet abgelaufen und aktiv", () => {
    expect(isAccessExpired("2026-11-21T11:59:59Z", now)).toBe(true);
    expect(isAccessExpired("2026-11-21T12:00:01Z", now)).toBe(false);
  });
  it("ohne Datum nicht abgelaufen", () => {
    expect(isAccessExpired(null, now)).toBe(false);
    expect(isAccessExpired(undefined, now)).toBe(false);
  });
});

describe("accessResultIsReadOnly (PROJ-28 BUG-6)", () => {
  it("sperrt bei einem Lesefehler", () => {
    expect(accessResultIsReadOnly({ data: null, error: { message: "down" } })).toBe(true);
  });
  it("sperrt ein abgelaufenes Projekt", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(accessResultIsReadOnly({ data: { expires_at: past }, error: null })).toBe(true);
  });
  it("lässt ein aktives Projekt und ein Projekt ohne Eintrag offen", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(accessResultIsReadOnly({ data: { expires_at: future }, error: null })).toBe(false);
    expect(accessResultIsReadOnly({ data: null, error: null })).toBe(false);
  });
});

describe("isProjectReadOnly (PROJ-28)", () => {
  it("aktiv: bearbeitbar", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(await isProjectReadOnly(client({ data: { expires_at: future }, error: null }), ID)).toBe(false);
  });
  it("abgelaufen: nur lesen", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await isProjectReadOnly(client({ data: { expires_at: past }, error: null }), ID)).toBe(true);
  });
  it("ohne Ablaufdatum: bearbeitbar", async () => {
    expect(await isProjectReadOnly(client({ data: { expires_at: null }, error: null }), ID)).toBe(false);
  });
  it("Datenbankfehler: lieber nur lesen", async () => {
    expect(await isProjectReadOnly(client({ data: null, error: { message: "down" } }), ID)).toBe(true);
  });
});

describe("projectWriteBlockedError", () => {
  it("aktiv: darf schreiben", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(await projectWriteBlockedError(client({ data: { expires_at: future }, error: null }), ID)).toBeNull();
  });
  it("abgelaufen: gesperrt", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await projectWriteBlockedError(client({ data: { expires_at: past }, error: null }), ID)).toBe(
      PROJECT_EXPIRED_ERROR,
    );
  });
  it("Datenbankfehler: lieber nicht schreiben", async () => {
    const res = await projectWriteBlockedError(client({ data: null, error: { message: "down" } }), ID);
    expect(res).toBeTruthy();
    expect(res).not.toBe(PROJECT_EXPIRED_ERROR);
  });
});
