import { describe, it, expect, vi, beforeEach } from "vitest";

// Env vars für Service-Role-Client BEVOR imports.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-dummy";
process.env.NEXT_PUBLIC_SITE_URL = "https://stage-app.narravit.de";

import { createClient } from "@/lib/supabase/server";
import {
  createInvitationAction,
  removeMemberAction,
  leaveProjectAction,
  acceptInvitationAction,
} from "./members-actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

// Service-Role-Mock: wir tracken INSERT/UPDATE-Aufrufe und liefern
// deterministische Antworten zurück.
const serviceRoleMockState: {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  nextInsertError: { code?: string } | null;
} = {
  inserts: [],
  updates: [],
  nextInsertError: null,
};

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        serviceRoleMockState.inserts.push({ table, payload });
        const error = serviceRoleMockState.nextInsertError;
        serviceRoleMockState.nextInsertError = null;
        return Promise.resolve({ data: null, error });
      },
      update: (payload: Record<string, unknown>) => ({
        eq: () => {
          serviceRoleMockState.updates.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  }),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const PL_USER_ID = "11111111-1111-4111-a111-111111111111";
const PL_EMAIL = "pl@example.com";
const CO_USER_ID = "22222222-2222-4222-a222-222222222222";
const MEMBER_ROW_ID = "55555555-5555-4555-a555-555555555555";
const INVITATION_ID = "66666666-6666-4666-a666-666666666666";

// ─── Builder-Mock (chainable Supabase-Builder) ───────────────────────────────

function makeBuilder(result: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
} = {}) {
  const final = { data: result.data ?? null, error: result.error ?? null };
  const resolved = Promise.resolve(final);
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
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
  user?: { id: string; email: string } | null;
  rpcResponse?: { data: unknown; error?: { code?: string } | null };
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: PL_USER_ID, email: PL_EMAIL } : opts.user },
      }),
    },
    from: vi.fn(),
    rpc: vi.fn().mockImplementation((_name: string) => ({
      maybeSingle: vi.fn().mockResolvedValue(
        opts.rpcResponse ?? { data: null, error: null },
      ),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceRoleMockState.inserts = [];
  serviceRoleMockState.updates = [];
  serviceRoleMockState.nextInsertError = null;
});

// ─── createInvitationAction ──────────────────────────────────────────────────

describe("createInvitationAction", () => {
  function fd(o: Record<string, string> = {}) {
    const f = new FormData();
    f.set("projectId", o.projectId ?? PROJECT_ID);
    f.set("email", o.email ?? "neu@example.com");
    f.set("role", o.role ?? "co_author");
    return f;
  }

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await createInvitationAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("rejects self-invite (own email)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never);
    expect(await createInvitationAction(fd({ email: PL_EMAIL }))).toEqual({
      error: "Du kannst dich nicht selbst einladen.",
    });
  });

  it("rejects when invoker is not PL of project", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(
      makeBuilder({ data: [{ user_id: PL_USER_ID, role: "co_author" }] }),
    );
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await createInvitationAction(fd())).toEqual({
      error: "Nur Projektleiter dürfen Einladungen erstellen.",
    });
  });

  it("rejects when email already belongs to a member", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({
        data: [
          { user_id: PL_USER_ID, role: "projektleiter" },
          { user_id: CO_USER_ID, role: "co_author" },
        ],
      }))
      .mockReturnValueOnce(makeBuilder({
        data: [{ email: "neu@example.com" }],
      }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await createInvitationAction(fd())).toEqual({
      error: "Diese Person ist bereits Mitglied dieses Projekts.",
    });
  });

  it("creates invitation and returns acceptUrl on happy path", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: [{ user_id: PL_USER_ID, role: "projektleiter" }] }))
      .mockReturnValueOnce(makeBuilder({ data: [] }))
      .mockReturnValueOnce(makeBuilder()); // invitations insert
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createInvitationAction(fd());
    expect(result.error).toBeUndefined();
    expect(result.token).toBeTruthy();
    expect(result.token!.length).toBeGreaterThanOrEqual(40);
    expect(result.acceptUrl).toMatch(
      /^https:\/\/stage-app\.narravit\.de\/einladung\/[A-Za-z0-9_-]+$/,
    );
  });
});

// ─── removeMemberAction ──────────────────────────────────────────────────────

describe("removeMemberAction", () => {
  function fd(o: Record<string, string> = {}) {
    const f = new FormData();
    f.set("projectId", o.projectId ?? PROJECT_ID);
    f.set("memberId", o.memberId ?? MEMBER_ROW_ID);
    return f;
  }

  it("returns error when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await removeMemberAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns 'Mitglied nicht gefunden' when target row not in project", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(makeBuilder({ data: null }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await removeMemberAction(fd())).toEqual({ error: "Mitglied nicht gefunden." });
  });

  it("translates trigger 23514 into Last-PL-Fehlermeldung", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { user_id: CO_USER_ID, project_id: PROJECT_ID } }))
      .mockReturnValueOnce(makeBuilder({ error: { code: "23514", message: "Letzter PL" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await removeMemberAction(fd())).toEqual({
      error: "Mindestens ein Projektleiter muss verbleiben.",
    });
  });

  it("happy path returns ok:true", async () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: { user_id: CO_USER_ID, project_id: PROJECT_ID } }))
      .mockReturnValueOnce(makeBuilder());
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await removeMemberAction(fd())).toEqual({ ok: true });
  });
});

// changeRoleAction wurde am 2026-05-21 entfernt (Refine PROJ-9):
// Rollen sind nach Einladungs-Annahme fest. Tests gestrichen.

// ─── leaveProjectAction ──────────────────────────────────────────────────────

describe("leaveProjectAction", () => {
  function fd(o: Record<string, string> = {}) {
    const f = new FormData();
    f.set("projectId", o.projectId ?? PROJECT_ID);
    return f;
  }

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await leaveProjectAction(fd())).toEqual({ error: "Nicht angemeldet." });
  });

  it("translates trigger 23514 into Last-PL-Self-Leave-Fehlermeldung", async () => {
    const client = makeMockClient();
    client.from.mockReturnValueOnce(
      makeBuilder({ error: { code: "23514", message: "Letzter PL" } }),
    );
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await leaveProjectAction(fd());
    expect(result.error).toMatch(/Befördere zuerst eine andere Person/);
  });
});

// ─── acceptInvitationAction ──────────────────────────────────────────────────

describe("acceptInvitationAction", () => {
  function fd(token = "tok-1234567890abcdef") {
    const f = new FormData();
    f.set("token", token);
    return f;
  }

  function mockRpc(client: ReturnType<typeof makeMockClient>, lookupRow: Record<string, unknown> | null) {
    client.rpc.mockImplementation(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: lookupRow, error: null }),
    }));
  }

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await acceptInvitationAction(fd())).toEqual({ error: "Bitte zuerst anmelden." });
  });

  it("rejects when token not found in lookup", async () => {
    const client = makeMockClient();
    mockRpc(client, null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect(await acceptInvitationAction(fd())).toEqual({ error: "Einladung nicht gefunden." });
  });

  it("rejects already-accepted invitation", async () => {
    const client = makeMockClient();
    mockRpc(client, {
      invitation_id: INVITATION_ID,
      project_id: PROJECT_ID,
      email: PL_EMAIL,
      role: "co_author",
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      accepted_at: "2026-01-01T00:00:00Z",
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await acceptInvitationAction(fd());
    expect(result.error).toMatch(/bereits angenommen/);
  });

  it("rejects expired invitation", async () => {
    const client = makeMockClient();
    mockRpc(client, {
      invitation_id: INVITATION_ID,
      project_id: PROJECT_ID,
      email: PL_EMAIL,
      role: "co_author",
      expires_at: new Date(Date.now() - 86400_000).toISOString(),
      accepted_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await acceptInvitationAction(fd());
    expect(result.error).toMatch(/abgelaufen/);
  });

  it("rejects when logged-in email differs from invite email", async () => {
    const client = makeMockClient({ user: { id: PL_USER_ID, email: "andere@example.com" } });
    mockRpc(client, {
      invitation_id: INVITATION_ID,
      project_id: PROJECT_ID,
      email: PL_EMAIL,
      role: "co_author",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      accepted_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await acceptInvitationAction(fd());
    expect(result.error).toMatch(/Diese Einladung gilt für/);
  });

  it("happy path: inserts project_members and marks invitation accepted", async () => {
    const client = makeMockClient();
    mockRpc(client, {
      invitation_id: INVITATION_ID,
      project_id: PROJECT_ID,
      email: PL_EMAIL,
      role: "co_author",
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      accepted_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await acceptInvitationAction(fd());
    expect(result).toEqual({ projectId: PROJECT_ID });
    // Service-role mock hat 1 INSERT auf project_members + 1 UPDATE auf invitations gesehen.
    expect(serviceRoleMockState.inserts).toHaveLength(1);
    expect(serviceRoleMockState.inserts[0].table).toBe("project_members");
    expect(serviceRoleMockState.inserts[0].payload).toMatchObject({
      project_id: PROJECT_ID,
      user_id: PL_USER_ID,
      role: "co_author",
    });
    expect(serviceRoleMockState.updates).toHaveLength(1);
    expect(serviceRoleMockState.updates[0].table).toBe("invitations");
    expect(serviceRoleMockState.updates[0].payload).toHaveProperty("accepted_at");
  });

  it("tolerates duplicate-key 23505 (user already member) and still marks accepted", async () => {
    const client = makeMockClient();
    mockRpc(client, {
      invitation_id: INVITATION_ID,
      project_id: PROJECT_ID,
      email: PL_EMAIL,
      role: "co_author",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      accepted_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    serviceRoleMockState.nextInsertError = { code: "23505" };

    const result = await acceptInvitationAction(fd());
    expect(result).toEqual({ projectId: PROJECT_ID });
    expect(serviceRoleMockState.updates).toHaveLength(1);
  });
});
