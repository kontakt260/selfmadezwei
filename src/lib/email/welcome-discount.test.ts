import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Lookup = { table: string; column: string; value: unknown };

const lookups: Lookup[] = [];
let hits: Array<(lookup: Lookup) => boolean> = [];
let failing: string | null = null;

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => ({
          limit: async () => {
            const lookup = { table, column, value };
            lookups.push(lookup);
            if (failing === table) return { data: null, error: { message: "boom" } };
            return { data: hits.some((hit) => hit(lookup)) ? [{ id: "x" }] : [], error: null };
          },
        }),
      }),
    }),
  }),
}));

import { resolveWelcomeDiscountCode } from "./welcome-discount";

const input = { userId: "user-1", email: " Maria@Example.test " };

beforeEach(() => {
  lookups.length = 0;
  hits = [];
  failing = null;
  process.env.WELCOME_DISCOUNT_CODE = " WILLKOMMEN50 ";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.WELCOME_DISCOUNT_CODE;
});

describe("resolveWelcomeDiscountCode", () => {
  it("gives the code to a self-registered account", async () => {
    await expect(resolveWelcomeDiscountCode(input)).resolves.toBe("WILLKOMMEN50");
    expect(lookups).toContainEqual({ table: "invitations", column: "email", value: "maria@example.test" });
  });

  it("returns nothing when no code is configured", async () => {
    delete process.env.WELCOME_DISCOUNT_CODE;
    await expect(resolveWelcomeDiscountCode(input)).resolves.toBeUndefined();
    expect(lookups).toHaveLength(0);
  });

  it.each([
    ["has paid", "payments", "user_id"],
    ["is a project member", "project_members", "user_id"],
    ["was invited or received a gift", "invitations", "email"],
    ["bought as a guest with this address", "purchase_claims", "buyer_email"],
    ["claimed a guest purchase", "purchase_claims", "claimed_by"],
  ])("gives no code to someone who %s", async (_case, table, column) => {
    hits = [(lookup) => lookup.table === table && lookup.column === column];
    await expect(resolveWelcomeDiscountCode(input)).resolves.toBeUndefined();
  });

  it("gives no code when a check fails", async () => {
    failing = "invitations";
    await expect(resolveWelcomeDiscountCode(input)).resolves.toBeUndefined();
  });
});
