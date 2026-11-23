import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// PROJ-6, BUG-G1/G6: Ablauf pro Projekt in der Middleware.

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  rows: [] as Array<{ project_id: string; expires_at: string | null }>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({ limit: async () => ({ data: state.rows, error: null }) }),
    }),
  }),
}));

import { updateSession } from "./middleware";

const ACTIVE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const EXPIRED = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

const visit = (path: string) => updateSession(new NextRequest(`https://app.test${path}`));
const target = (res: Response) => res.headers.get("location");

beforeEach(() => {
  state.user = { id: "u1" };
  state.rows = [
    { project_id: ACTIVE, expires_at: future() },
    { project_id: EXPIRED, expires_at: past() },
  ];
});

describe("Ablauf pro Projekt (PROJ-28: Lesemodus statt Umleitung)", () => {
  it("lässt das abgelaufene Projekt mit allen Unterseiten durch", async () => {
    expect(target(await visit(`/projektuebersicht/${EXPIRED}`))).toBeNull();
    expect(target(await visit(`/projektuebersicht/${EXPIRED}/kapiteleditor/x`))).toBeNull();
    expect(target(await visit(`/projektuebersicht/${EXPIRED}/cover-bearbeiten`))).toBeNull();
  });

  it("lässt das aktive Projekt und die Startseite durch", async () => {
    expect(target(await visit(`/projektuebersicht/${ACTIVE}`))).toBeNull();
    expect(target(await visit("/"))).toBeNull();
  });

  it("Abbruch im Checkout: die Person bleibt in der Projektübersicht", async () => {
    expect(target(await visit(`/projektuebersicht/${EXPIRED}?checkout=cancelled`))).toBeNull();
  });

  it("alle Projekte abgelaufen: die Startseite bleibt erreichbar", async () => {
    state.rows = [{ project_id: EXPIRED, expires_at: past() }];
    expect(target(await visit("/"))).toBeNull();
  });

  it("noch nie bezahlt: weiter zum Einlösen", async () => {
    state.rows = [];
    expect(target(await visit("/"))).toBe("https://app.test/kauf-einloesen");
  });

  it("der Link aus der Kauf-Mail ist ohne Anmeldung erreichbar", async () => {
    state.user = null;
    expect(target(await visit("/kauf-zuordnen?code=x&ziel=anmelden"))).toBeNull();
  });

  it("die alte Abgelaufen-Seite verlangt eine Anmeldung", async () => {
    state.user = null;
    expect(target(await visit("/zugang-abgelaufen"))).toBe("https://app.test/anmelden");
  });
});
