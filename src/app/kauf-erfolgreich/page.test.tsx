import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  user: { id: "u1" } as { id: string } | null,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: async () => state.session } } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));
vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/purchases/guest-purchase", async () => {
  const isGuestSession = (s: { metadata?: Record<string, string> }) => s.metadata?.guest === "1";
  const isDirectGiftSession = (s: { metadata?: Record<string, string> }) =>
    s.metadata?.gift_direct === "1";
  return { isGuestSession, isDirectGiftSession };
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import KaufErfolgreichPage from "./page";

const paidSession = (metadata: Record<string, string>) => ({
  status: "complete",
  payment_status: "paid",
  amount_total: 24900,
  customer_details: { email: "kaeufer@example.com" },
  metadata: { product_type: "initial", ...metadata },
});

const show = async () =>
  render(await KaufErfolgreichPage({ searchParams: Promise.resolve({ session_id: "cs_test_1" }) }));

beforeEach(() => {
  state.user = { id: "u1" };
});

describe("/kauf-erfolgreich — Geschenk „nur erzählen“", () => {
  beforeEach(() => {
    state.session = paidSession({
      user_id: "u1",
      is_gift: "1",
      gift_mode: "phone-only",
      gift_recipient_name: "Opa Ernd",
    });
  });

  it("nennt Verwaltung und Kontaktweg, Button führt zum Projekt", async () => {
    const { container } = await show();
    const text = container.textContent ?? "";
    expect(text).toContain("können die Geschichten der beschenkten Person im Portal lesen und das Projekt verwalten");
    expect(text).toContain("Opa Ernd erzählt die Geschichten per Sprachnachricht");
    expect(text).toContain("auf dem von Ihnen bevorzugten Kontaktweg");
    expect(screen.getByRole("link", { name: "Zum Projekt" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "Zur Startseite" })).toBeNull();
  });

  it("setzt kein Geschlecht der beschenkten Person voraus", async () => {
    const { container } = await show();
    expect(container.textContent).not.toMatch(/\b(er|sie|ihm|ihr)\s*\/\s*(er|sie|ihm|ihr)\b/i);
  });
});

describe("/kauf-erfolgreich — Geschenk mit eigenem Zugang", () => {
  it("spricht vom Geschenk statt von der Einladung", async () => {
    state.session = paidSession({
      user_id: "u1",
      is_gift: "1",
      gift_mode: "phone-plus-computer",
      gift_recipient_email: "oma@example.com",
      buyer_retains_access: "1",
    });
    const { container } = await show();
    const text = container.textContent ?? "";
    expect(text).toContain("Wir haben das Geschenk versendet — sobald die beschenkte Person es empfängt");
    expect(text).toContain("Geschenk-Mail unterwegs an oma@example.com");
    expect(text).not.toContain("bleibt gültig");
    expect(text).toContain("mitschreiben, die Geschichten lesen & das Projekt verwalten");
    expect(text).not.toMatch(/Einladung/);
    expect(screen.getByRole("link", { name: "Zum Projekt" })).toBeTruthy();
  });
});

describe("/kauf-erfolgreich — Geschenk ohne eigenen Zugang", () => {
  it("ist ohne Anmeldung sichtbar, kurz und ohne Konto-Schritt", async () => {
    state.user = null;
    state.session = paidSession({
      gift_direct: "1",
      is_gift: "1",
      gift_mode: "phone-plus-computer",
      gift_recipient_email: "oma@example.com",
      buyer_retains_access: "0",
    });
    const { container } = await show();
    const text = container.textContent ?? "";
    expect(text).toContain("Wir haben das Geschenk verschickt.");
    expect(text).toContain("Geschenk unterwegs an oma@example.com");
    expect(text).not.toContain("Sobald sie");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("nennt die beschenkte Person, wenn die Adresse nicht mehr zu finden ist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = null;
    state.session = paidSession({
      gift_direct: "1",
      is_gift: "1",
      gift_mode: "phone-plus-computer",
      narration_draft: "11111111-1111-4111-8111-111111111111",
      buyer_retains_access: "0",
    });
    const { container } = await show();
    expect(container.textContent).toContain("Geschenk unterwegs an die beschenkte Person");
  });
});
