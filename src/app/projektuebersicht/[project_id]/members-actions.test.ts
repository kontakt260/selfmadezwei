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
const projectWriteBlockedErrorMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/lib/projects/project-access", () => ({
  projectWriteBlockedError: projectWriteBlockedErrorMock,
}));
const hitRateLimitsMock = vi.hoisted(() =>
  vi.fn(async (): Promise<{ allowed: boolean; unavailable: boolean }> => ({
    allowed: true,
    unavailable: false,
  })),
);
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  hitRateLimits: hitRateLimitsMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
const notifyProjectHandoverMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-project-handover", () => ({
  notifyProjectHandover: notifyProjectHandoverMock,
}));

// Service-Role-Mock: wir tracken INSERT/UPDATE-Aufrufe und liefern
// deterministische Antworten zurück.
const serviceRoleMockState: {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  nextInsertError: { code?: string } | null;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  lookupRow: Record<string, unknown> | null;
  leaveResponse: { data: unknown; error: { message: string } | null };
} = {
  inserts: [],
  updates: [],
  nextInsertError: null,
  rpcCalls: [],
  lookupRow: null,
  leaveResponse: { data: { handover: null }, error: null },
};

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    // lookup_invitation_by_token ist nur für service_role freigegeben
    // (Migration 20261119210000_lookup_invitation_service_role_only).
    rpc: (name: string, args: Record<string, unknown>) => {
      serviceRoleMockState.rpcCalls.push({ name, args });
      if (name === "leave_project") return Promise.resolve(serviceRoleMockState.leaveResponse);
      return {
        maybeSingle: () =>
          Promise.resolve({ data: serviceRoleMockState.lookupRow, error: null }),
      };
    },
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
          const done = Promise.resolve({ data: null, error: null });
          return Object.assign(done, { is: () => done });
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
  hitRateLimitsMock.mockReset().mockResolvedValue({ allowed: true, unavailable: false });
  serviceRoleMockState.inserts = [];
  serviceRoleMockState.updates = [];
  serviceRoleMockState.nextInsertError = null;
  serviceRoleMockState.rpcCalls = [];
  serviceRoleMockState.lookupRow = null;
  serviceRoleMockState.leaveResponse = { data: { handover: null }, error: null };
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
      error: "Sie können sich nicht selbst einladen.",
    });
  });

  const projectLeadClient = () => {
    const client = makeMockClient();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: [{ user_id: PL_USER_ID, role: "projektleiter" }] }))
      .mockReturnValueOnce(makeBuilder({ data: [{ email: PL_EMAIL }] }));
    return client;
  };

  it("stops at the daily invitation limit of the project (PROJ-17)", async () => {
    const client = projectLeadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    hitRateLimitsMock.mockResolvedValueOnce({ allowed: false, unavailable: false });

    const result = await createInvitationAction(fd());

    expect(result.error).toContain("zu viele Einladungen");
    expect(client.from).not.toHaveBeenCalledWith("invitations");
    expect(hitRateLimitsMock.mock.calls[0]).toEqual([
      [expect.objectContaining({ identifier: PROJECT_ID })],
    ]);
  });

  it("creates no invitation when the counters are unavailable (PROJ-17)", async () => {
    const client = projectLeadClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    hitRateLimitsMock.mockResolvedValueOnce({ allowed: false, unavailable: true });

    const result = await createInvitationAction(fd());

    expect(result.error).toContain("nicht geklappt");
    expect(client.from).not.toHaveBeenCalledWith("invitations");
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

  it("creates invitation with a strong token and does not return the link", async () => {
    const client = makeMockClient();
    const invitationInsert = makeBuilder();
    client.from
      .mockReturnValueOnce(makeBuilder({ data: [{ user_id: PL_USER_ID, role: "projektleiter" }] }))
      .mockReturnValueOnce(makeBuilder({ data: [] }))
      .mockReturnValueOnce(invitationInsert) // invitations insert
      // PROJ-11: nach dem invitation-insert holt der Action den Projekt-
      // Titel + das Inviter-Profil für die Mail-Personalisierung (fire-
      // and-forget). Beide Reads dürfen leer zurückkommen — die Mail
      // verwendet dann Fallback-Werte.
      .mockReturnValueOnce(makeBuilder({ data: { title: "Mein Projekt" } }))
      .mockReturnValueOnce(makeBuilder({ data: { full_name: "Test PL" } }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createInvitationAction(fd());
    // Entscheidung 2026-10-14: Einladung nur per Mail, kein Link in der Antwort.
    expect(result).toEqual({ ok: true });
    expect(invitationInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "neu@example.com",
        token: expect.stringMatching(/^[A-Za-z0-9_-]{40,}$/),
      }),
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
    if (o.successorUserId) f.set("successorUserId", o.successorUserId);
    return f;
  }

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await leaveProjectAction(fd())).toEqual({ error: "Nicht angemeldet." });
    expect(serviceRoleMockState.rpcCalls).toEqual([]);
  });

  it("rejects a malformed successor", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never);
    const result = await leaveProjectAction(fd({ successorUserId: "kein-uuid" }));
    expect(result.error).toBeDefined();
    expect(serviceRoleMockState.rpcCalls).toEqual([]);
  });

  it.each([
    ["successor_required", /wer das Projekt weiterführen/],
    ["last_member", /einzige Person/],
    ["not_member", /nicht gefunden/],
    ["boom", /nicht verlassen/],
  ])("translates %s into a message", async (message, expected) => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never);
    serviceRoleMockState.leaveResponse = { data: null, error: { message } };
    const result = await leaveProjectAction(fd());
    expect(result.error).toMatch(expected);
    expect(notifyProjectHandoverMock).not.toHaveBeenCalled();
  });

  it("leaves with the person from the session and informs the successor", async () => {
    const handover = {
      projectId: PROJECT_ID,
      title: "Omas Lebensbuch",
      to: "co@example.com",
      fullName: "Co Autorin",
    };
    vi.mocked(createClient).mockResolvedValue(makeMockClient() as never);
    serviceRoleMockState.leaveResponse = { data: { handover }, error: null };

    await expect(leaveProjectAction(fd({ successorUserId: CO_USER_ID }))).rejects.toThrow("REDIRECT");

    expect(serviceRoleMockState.rpcCalls).toEqual([
      {
        name: "leave_project",
        args: {
          p_project_id: PROJECT_ID,
          p_user_id: PL_USER_ID,
          p_successor_user_id: CO_USER_ID,
        },
      },
    ]);
    expect(notifyProjectHandoverMock).toHaveBeenCalledWith(handover);
  });
});

// ─── acceptInvitationAction ──────────────────────────────────────────────────

describe("acceptInvitationAction", () => {
  function fd(token = "tok-1234567890abcdef") {
    const f = new FormData();
    f.set("token", token);
    return f;
  }

  // Der Lookup läuft über den Service-Role-Client, nicht über die Session.
  function mockRpc(_client: ReturnType<typeof makeMockClient>, lookupRow: Record<string, unknown> | null) {
    serviceRoleMockState.lookupRow = lookupRow;
  }

  it("rejects when not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeMockClient({ user: null }) as never);
    expect(await acceptInvitationAction(fd())).toEqual({ error: "Bitte zuerst anmelden." });
  });

  const openInvitation = (role: string) => ({
    invitation_id: INVITATION_ID,
    project_id: PROJECT_ID,
    email: PL_EMAIL,
    role,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    accepted_at: null,
  });

  it("Geschenk ohne Konto des Käufers: Projektleiter wird Eigentümer", async () => {
    const client = makeMockClient();
    mockRpc(client, openInvitation("projektleiter"));
    vi.mocked(createClient).mockResolvedValue(client as never);
    expect((await acceptInvitationAction(fd())).projectId).toBe(PROJECT_ID);
    expect(serviceRoleMockState.updates).toContainEqual({
      table: "projects",
      payload: { owner_id: PL_USER_ID },
    });
  });

  it("Co-Autor wird nie Eigentümer", async () => {
    const client = makeMockClient();
    mockRpc(client, openInvitation("co_author"));
    vi.mocked(createClient).mockResolvedValue(client as never);
    await acceptInvitationAction(fd());
    expect(serviceRoleMockState.updates.some((u) => u.table === "projects")).toBe(false);
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
    // Lookup lief über service_role, nicht über den Session-Client.
    expect(serviceRoleMockState.rpcCalls).toEqual([
      { name: "lookup_invitation_by_token", args: { p_token: "tok-1234567890abcdef" } },
    ]);
    expect(client.rpc).not.toHaveBeenCalled();
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
