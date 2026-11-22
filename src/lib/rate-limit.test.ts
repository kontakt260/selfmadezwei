// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const deleted: Array<{ scope: unknown; hash: unknown }> = [];
let deleteError: { message: string } | null = null;
let clientThrows = false;

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => {
    if (clientThrows) throw new Error("no client");
    return {
      rpc: (...args: unknown[]) => rpc(...args),
      from: () => ({
        delete: () => ({
          eq: (_c1: string, scope: unknown) => ({
            eq: async (_c2: string, hash: unknown) => {
              deleted.push({ scope, hash });
              return { error: deleteError };
            },
          }),
        }),
      }),
    };
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import {
  RATE_LIMITS,
  clearRateLimit,
  getClientIp,
  getRequestIp,
  hitRateLimits,
  undoRateLimits,
} from "./rate-limit";

const allowed = { data: [{ is_allowed: true, current_hits: 1, retry_after_seconds: 60 }], error: null };
const blocked = { data: [{ is_allowed: false, current_hits: 6, retry_after_seconds: 60 }], error: null };
const ip = { rule: RATE_LIMITS.loginIp, identifier: "203.0.113.7" };
const account = { rule: RATE_LIMITS.loginAccount, identifier: "Maria@Example.test" };

beforeEach(() => {
  rpc.mockReset().mockResolvedValue(allowed);
  deleted.length = 0;
  deleteError = null;
  clientThrows = false;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("RATE_LIMIT_DISABLED", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getClientIp", () => {
  it("prefers the Vercel header", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "203.0.113.7" });
    expect(getClientIp(h)).toBe("198.51.100.1");
  });

  it("takes the first entry of x-forwarded-for", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("reads the headers of the current request", async () => {
    await expect(getRequestIp()).resolves.toBe("203.0.113.7");
  });
});

describe("Limit-Konfiguration", () => {
  it("matches the spec", () => {
    expect(RATE_LIMITS.loginIp).toMatchObject({ limit: 5, windowSeconds: 900 });
    expect(RATE_LIMITS.loginAccount).toMatchObject({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMITS.resetIp).toMatchObject({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMITS.resetEmail).toMatchObject({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMITS.resendIp).toMatchObject({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMITS.resendEmail).toMatchObject({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMITS.register).toMatchObject({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMITS.accountReset).toMatchObject({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMITS.checkout).toMatchObject({ limit: 20, windowSeconds: 3600 });
    expect(RATE_LIMITS.invitation).toMatchObject({ limit: 20, windowSeconds: 86400 });
  });

  it("uses a separate scope for every rule", () => {
    const scopes = Object.values(RATE_LIMITS).map((r) => r.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });
});

describe("hitRateLimits", () => {
  it("allows when all limits are within range", async () => {
    await expect(hitRateLimits([ip, account])).resolves.toEqual({ allowed: true, unavailable: false });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_scope: "login_ip", p_limit: 5, p_window_seconds: 900 });
  });

  it("stops at the first exceeded limit, a blocked IP does not count against the account", async () => {
    rpc.mockResolvedValueOnce(blocked);
    await expect(hitRateLimits([ip, account])).resolves.toEqual({ allowed: false, unavailable: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("never sends the identifier in clear text", async () => {
    await hitRateLimits([ip, account]);
    const sent = JSON.stringify(rpc.mock.calls);
    expect(sent).not.toContain("203.0.113.7");
    expect(sent.toLowerCase()).not.toContain("maria@example.test");
    expect(rpc.mock.calls[0][1].p_identifier_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats different spellings of an address as the same identifier", async () => {
    await hitRateLimits([{ rule: RATE_LIMITS.resetEmail, identifier: " Maria@Example.TEST " }]);
    await hitRateLimits([{ rule: RATE_LIMITS.resetEmail, identifier: "maria@example.test" }]);
    expect(rpc.mock.calls[0][1].p_identifier_hash).toBe(rpc.mock.calls[1][1].p_identifier_hash);
  });

  it("does not log clear text when a limit is hit", async () => {
    rpc.mockResolvedValueOnce(blocked);
    await hitRateLimits([account]);
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("rate_limit_hit");
    expect(logged.toLowerCase()).not.toContain("maria@example.test");
  });

  it.each([
    ["a database error", { data: null, error: { message: "boom" } }],
    ["an empty answer", { data: [], error: null }],
  ])("reports unavailable on %s", async (_name, answer) => {
    rpc.mockResolvedValueOnce(answer);
    await expect(hitRateLimits([ip])).resolves.toEqual({ allowed: false, unavailable: true });
  });

  it("reports unavailable when the client cannot be created", async () => {
    clientThrows = true;
    await expect(hitRateLimits([ip])).resolves.toEqual({ allowed: false, unavailable: true });
  });

  it("can be switched off outside production", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(hitRateLimits([ip])).resolves.toEqual({ allowed: true, unavailable: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores the switch in production", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    await hitRateLimits([ip]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("undoRateLimits und clearRateLimit", () => {
  it("takes back one attempt", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await undoRateLimits([ip]);
    expect(rpc.mock.calls[0][0]).toBe("rate_limit_undo");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_scope: "login_ip" });
  });

  it("clears a counter by scope and hash", async () => {
    await clearRateLimit(account);
    expect(deleted[0].scope).toBe("login_account");
    expect(deleted[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never throws", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    deleteError = { message: "boom" };
    await expect(undoRateLimits([ip])).resolves.toBeUndefined();
    await expect(clearRateLimit(account)).resolves.toBeUndefined();
    clientThrows = true;
    await expect(undoRateLimits([ip])).resolves.toBeUndefined();
    await expect(clearRateLimit(account)).resolves.toBeUndefined();
  });
});
