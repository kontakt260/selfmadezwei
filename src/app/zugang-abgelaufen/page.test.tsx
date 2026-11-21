import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  access: [] as Array<{ project_id: string; expires_at: string | null }>,
  projects: [] as Array<{ id: string; title: string }>,
  checkoutInputs: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () =>
        table === "project_access"
          ? { limit: async () => ({ data: state.access, error: null }) }
          : { in: () => ({ limit: async () => ({ data: state.projects, error: null }) }) },
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/components/auth/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/auth/SignOutButton", () => ({ SignOutButton: () => <button>Abmelden</button> }));
vi.mock("@/components/CheckoutCancelToast", () => ({ CheckoutCancelToast: () => null }));
vi.mock("@/components/projektuebersicht/CheckoutButton", () => ({
  CheckoutButton: ({ label, input, disabled }: { label: string; input: unknown; disabled?: boolean }) => {
    state.checkoutInputs.push(input);
    return <button disabled={disabled}>{label}</button>;
  },
}));

import ZugangAbgelaufenPage from "./page";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const past = () => new Date(Date.now() - 86_400_000).toISOString();
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const show = async (project?: string) =>
  render(await ZugangAbgelaufenPage({ searchParams: Promise.resolve({ project }) }));

beforeEach(() => {
  state.user = { id: "u1" };
  state.access = [{ project_id: A, expires_at: past() }];
  state.projects = [{ id: A, title: "Omas Lebensbuch" }];
  state.checkoutInputs = [];
});

describe("/zugang-abgelaufen", () => {
  it("zeigt das Projekt mit aktivem Verlängern-Button zum richtigen Preis", async () => {
    await show();
    expect(screen.getByText("Omas Lebensbuch")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Um 12 Monate verlängern — 99 €" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(state.checkoutInputs).toEqual([{ productType: "renewal", projectId: A }]);
    expect(screen.queryByText(/79/)).toBeNull();
  });

  it("mit ?project nur dieses abgelaufene Projekt", async () => {
    state.access = [
      { project_id: A, expires_at: past() },
      { project_id: B, expires_at: past() },
    ];
    await show(B);
    expect(state.checkoutInputs).toEqual([{ productType: "renewal", projectId: B }]);
  });

  it("ein fremdes ?project wird ignoriert", async () => {
    await show(B);
    expect(state.checkoutInputs).toEqual([{ productType: "renewal", projectId: A }]);
  });

  it("verweist auf andere aktive Projekte", async () => {
    state.access.push({ project_id: B, expires_at: future() });
    await show();
    expect(screen.getByRole("link", { name: "Zu meinen anderen Projekten" })).toBeTruthy();
  });

  it("nichts abgelaufen: zurück in die App", async () => {
    state.access = [{ project_id: A, expires_at: future() }];
    await expect(show()).rejects.toThrow("REDIRECT:/");
  });

  it("nicht angemeldet: führt zur Anmeldung, kein Kauf-Button", async () => {
    state.user = null;
    await show();
    expect(screen.getByRole("link", { name: "Anmelden" }).getAttribute("href")).toContain("next=%2Fzugang-abgelaufen");
    expect(state.checkoutInputs).toEqual([]);
  });
});
