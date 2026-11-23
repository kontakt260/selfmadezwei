// PROJ-24 — Kontaktdaten auf dem Weg durch den Kauf.
//
// Abgesichert:
//   - Der Server prüft alle Angaben selbst und behält nur das Nötige.
//   - Die Daten kommen bei allen Kaufwegen ans Projekt.
//   - Ein Fehler bei den Kontaktdaten verhindert nie einen Kauf.
//   - Abgelaufene Kauf-Vorbereitungen werden gelöscht.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createFakeSupabase, type FakeDb, type FakeSupabaseOptions } from "@/test/fake-supabase";
import { fulfillInitialPurchase } from "./fulfill-initial";
import {
  applyNarrationDraft,
  buildNarrationDraft,
  createNarrationDraft,
  findGiftRecipientEmail,
  markNarrationDraft,
  purgeExpiredNarrationDrafts,
  readGiftRecipientEmail,
  removeNarrationDraft,
  type NarrationDraftContext,
} from "./narration-draft";

let db: FakeDb;
let options: FakeSupabaseOptions;
const client = () => createFakeSupabase(db, options) as unknown as SupabaseClient<Database>;

beforeEach(() => {
  db = {
    purchase_narration_drafts: [],
    narration_settings: [],
    projects: [],
    project_access: [],
    project_members: [],
    invitations: [],
    payments: [],
  };
  options = {};
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const giftPhoneOnly: NarrationDraftContext = {
  fullName: "Karla Käufer",
  isGift: true,
  giftMode: "phone-only",
  giftRecipientName: "Oma Erna",
  isGuest: false,
};
const selfGuest: NarrationDraftContext = {
  fullName: "Karla Käufer",
  isGift: false,
  isGuest: true,
};

describe("buildNarrationDraft", () => {
  it("verlangt bei „Nur per Sprachnachricht“ einen Kontakt", () => {
    expect(buildNarrationDraft(giftPhoneOnly)).toEqual({ ok: false });
    expect(
      buildNarrationDraft({
        ...giftPhoneOnly,
        narration: { enabled: false, channel: "email", email: "oma@example.test" },
      }),
    ).toEqual({ ok: false });
  });

  it("legt bei Nein nichts an", () => {
    expect(
      buildNarrationDraft({
        ...selfGuest,
        narration: { enabled: false, channel: "email" },
      }),
    ).toEqual({ ok: true, draft: null });
  });

  it("speichert die Nummer international und nimmt den Namen der beschenkten Person", () => {
    expect(
      buildNarrationDraft({
        ...giftPhoneOnly,
        narration: { enabled: true, channel: "sms", phone: "+31 6 12345678", email: "weg@example.test" },
      }),
    ).toEqual({
      ok: true,
      draft: {
        narrator_name: "Oma Erna",
        channel: "sms",
        email: null,
        phone: "+31612345678",
        uses_checkout_email: false,
      },
    });
  });

  it("lehnt ungültige Kontaktdaten ab", () => {
    for (const narration of [
      { enabled: true, channel: "email" as const, email: "keine-adresse" },
      { enabled: true, channel: "sms" as const, phone: "030 1234567" },
      { enabled: true, channel: "both" as const, email: "oma@example.test", phone: "123" },
    ]) {
      expect(buildNarrationDraft({ ...giftPhoneOnly, narration })).toEqual({ ok: false });
    }
  });

  it("nutzt beim Gast für sich selbst die Adresse aus der Zahlung", () => {
    const result = buildNarrationDraft({
      ...selfGuest,
      narration: { enabled: true, channel: "email", email: "ignoriert@example.test" },
    });
    expect(result).toMatchObject({
      ok: true,
      draft: { narrator_name: "Karla Käufer", email: null, uses_checkout_email: true },
    });
  });

  it("verlangt von angemeldeten Käufern eine Adresse", () => {
    expect(
      buildNarrationDraft({
        ...selfGuest,
        isGuest: false,
        narration: { enabled: true, channel: "email" },
      }),
    ).toEqual({ ok: false });
  });
});

describe("Kauf-Vorbereitung", () => {
  const values = {
    narrator_name: "Oma Erna",
    channel: "email" as const,
    email: "oma@example.test",
    phone: null,
    uses_checkout_email: false,
  };

  it("meldet einen Speicherfehler als null statt zu werfen", async () => {
    options = { failOn: (op, table) => (op === "insert" && table === "purchase_narration_drafts" ? "kaputt" : null) };
    await expect(createNarrationDraft(client(), values)).resolves.toBeNull();
  });

  it("setzt den Zustand und löscht wieder", async () => {
    const id = await createNarrationDraft(client(), values);
    db.purchase_narration_drafts[0].status = "open";
    await markNarrationDraft(client(), id, "payment_pending");
    expect(db.purchase_narration_drafts[0]).toMatchObject({ status: "payment_pending" });
    await removeNarrationDraft(client(), id);
    expect(db.purchase_narration_drafts).toHaveLength(0);
  });

  it("ein spätes „unbezahlt“ verkürzt die Frist eines bezahlten Kaufs nicht", async () => {
    const id = await createNarrationDraft(client(), values);
    await markNarrationDraft(client(), id, "paid");
    const paidAt = db.purchase_narration_drafts[0].status_changed_at;
    await markNarrationDraft(client(), id, "payment_pending");
    expect(db.purchase_narration_drafts[0]).toMatchObject({
      status: "paid",
      status_changed_at: paidAt,
    });
  });

  it("speichert nur die Geschenk-Adresse, wenn keine Impulse gewünscht sind", async () => {
    const id = await createNarrationDraft(client(), null, "oma@example.test");
    expect(db.purchase_narration_drafts[0]).toMatchObject({
      id,
      narrator_name: null,
      channel: null,
      gift_recipient_email: "oma@example.test",
    });
    await applyNarrationDraft(client(), { draftId: id, projectId: "p1", buyerEmail: null });
    expect(db.narration_settings).toHaveLength(0);
  });

  it("überträgt die Adresse aus dem Checkout", async () => {
    db.purchase_narration_drafts.push({
      id: "d1",
      narrator_name: "Karla",
      channel: "both",
      email: null,
      phone: "+491711234567",
      uses_checkout_email: true,
    });
    await applyNarrationDraft(client(), { draftId: "d1", projectId: "p1", buyerEmail: " Karla@Example.test " });
    expect(db.narration_settings[0]).toMatchObject({
      project_id: "p1",
      channel: "both",
      email: "karla@example.test",
      phone: "+491711234567",
    });
  });

  it("fällt ohne Checkout-Adresse bei „beides“ auf SMS zurück", async () => {
    db.purchase_narration_drafts.push({
      id: "d1",
      narrator_name: "Karla",
      channel: "both",
      email: null,
      phone: "+491711234567",
      uses_checkout_email: true,
    });
    await applyNarrationDraft(client(), { draftId: "d1", projectId: "p1", buyerEmail: null });
    expect(db.narration_settings[0]).toMatchObject({ channel: "sms", email: null });
  });

  it("legt ohne erreichbaren Kontakt nichts an", async () => {
    db.purchase_narration_drafts.push({
      id: "d1",
      narrator_name: "Karla",
      channel: "email",
      email: null,
      phone: null,
      uses_checkout_email: true,
    });
    await applyNarrationDraft(client(), { draftId: "d1", projectId: "p1", buyerEmail: null });
    expect(db.narration_settings).toHaveLength(0);
  });

  it("löscht nur abgelaufene Einträge je Zustand", async () => {
    const now = Date.parse("2026-12-31T12:00:00Z");
    const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
    db.purchase_narration_drafts.push(
      { id: "open-alt", status: "open", status_changed_at: ago(3) },
      { id: "open-neu", status: "open", status_changed_at: ago(1) },
      { id: "sepa-alt", status: "payment_pending", status_changed_at: ago(22) },
      { id: "sepa-neu", status: "payment_pending", status_changed_at: ago(20) },
      { id: "paid-alt", status: "paid", status_changed_at: ago(91) },
      { id: "paid-neu", status: "paid", status_changed_at: ago(89) },
    );
    await expect(purgeExpiredNarrationDrafts(client(), now)).resolves.toEqual({ removed: 3 });
    expect(db.purchase_narration_drafts.map((row) => row.id)).toEqual([
      "open-neu",
      "sepa-neu",
      "paid-neu",
    ]);
  });
});

describe("Adresse für die Geschenk-Einladung", () => {
  const draftId = "11111111-1111-4111-8111-111111111111";

  it("liest sie aus der Vorbereitung und noch aus älteren Metadaten", async () => {
    db.purchase_narration_drafts.push({ id: draftId, gift_recipient_email: "oma@example.test" });
    await expect(readGiftRecipientEmail(client(), { narration_draft: draftId })).resolves.toBe(
      "oma@example.test",
    );
    await expect(
      readGiftRecipientEmail(client(), { gift_recipient_email: " alt@example.test " }),
    ).resolves.toBe("alt@example.test");
  });

  it("behandelt eine kaputte Kennung als fehlend", async () => {
    await expect(readGiftRecipientEmail(client(), { narration_draft: "kaputt" })).resolves.toBeNull();
  });

  it("meldet einen Datenbankfehler, damit Stripe wiederholt", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "kaputt" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;
    await expect(readGiftRecipientEmail(failing, { narration_draft: draftId })).rejects.toThrow(
      "kaputt",
    );
  });

  it("findet sie nach der Erfüllung über die Einladung", async () => {
    db.payments.push({ stripe_session_id: "cs_1", project_id: "p1" });
    db.invitations.push({ project_id: "p1", is_gift: true, email: "oma@example.test" });
    await expect(
      findGiftRecipientEmail(client(), {
        stripeSessionId: "cs_1",
        meta: { narration_draft: draftId },
      }),
    ).resolves.toBe("oma@example.test");
  });

  it("bleibt leer, wenn sie nicht mehr zu finden ist", async () => {
    await expect(
      findGiftRecipientEmail(client(), { stripeSessionId: "cs_2", meta: {} }),
    ).resolves.toBe("");
  });

  const computerGift = {
    stripeSessionId: "cs_gift",
    amountCents: 24900,
    currency: "eur",
    meta: {
      is_gift: "1",
      gift_mode: "phone-plus-computer",
      gift_recipient_role: "co_author",
      buyer_retains_access: "1",
      narration_draft: draftId,
    },
  };

  it("lädt die Person aus der Vorbereitung ein und löscht die Adresse danach", async () => {
    db.purchase_narration_drafts.push({
      id: draftId,
      narrator_name: null,
      channel: null,
      gift_recipient_email: "Oma@Example.test",
    });
    const result = await fulfillInitialPurchase(client(), { ...computerGift, userId: "user-1" });
    expect(result.invitation?.email).toBe("Oma@Example.test");
    expect(db.invitations[0]).toMatchObject({ email: "oma@example.test", role: "co_author" });
    expect(db.narration_settings).toHaveLength(0);
    expect(db.purchase_narration_drafts).toHaveLength(0);
  });

  it("lässt das Projekt beim Käufer, wenn die Adresse abgelaufen ist", async () => {
    const result = await fulfillInitialPurchase(client(), {
      ...computerGift,
      userId: "user-1",
      meta: { ...computerGift.meta, buyer_retains_access: "0" },
    });
    expect(result).toMatchObject({ buyerIsMember: true, invitation: null });
    expect(db.project_members[0]).toMatchObject({ user_id: "user-1", role: "projektleiter" });
  });

  it("legt ohne Konto und ohne Adresse kein Projekt an", async () => {
    await expect(
      fulfillInitialPurchase(client(), {
        ...computerGift,
        userId: null,
        meta: { ...computerGift.meta, buyer_retains_access: "0" },
      }),
    ).rejects.toThrow(/without account/);
    expect(db.projects).toHaveLength(0);
  });
});

describe("fulfillInitialPurchase mit Erzähl-Impulsen", () => {
  const purchase = {
    userId: "user-1",
    stripeSessionId: "cs_test_1",
    amountCents: 24900,
    currency: "eur",
    meta: { is_gift: "0", narration_draft: "d1" },
    buyerEmail: "kaeufer@example.test",
  };
  const addDraft = () =>
    db.purchase_narration_drafts.push({
      id: "d1",
      narrator_name: "Karla",
      channel: "email",
      email: "karla@example.test",
      phone: null,
      uses_checkout_email: false,
    });

  it("legt die Einstellungen an und löscht die Vorbereitung", async () => {
    addDraft();
    const result = await fulfillInitialPurchase(client(), purchase);
    expect(db.narration_settings[0]).toMatchObject({
      project_id: result.projectId,
      narrator_name: "Karla",
      email: "karla@example.test",
    });
    expect(db.purchase_narration_drafts).toHaveLength(0);
  });

  it("behält die Vorbereitung, wenn die Erfüllung scheitert", async () => {
    addDraft();
    options = { failOn: (op, table) => (op === "insert" && table === "payments" ? "kaputt" : null) };
    await expect(fulfillInitialPurchase(client(), purchase)).rejects.toThrow("kaputt");
    expect(db.purchase_narration_drafts).toHaveLength(1);
    expect(db.projects).toHaveLength(0);
  });

  it("erfüllt den Kauf auch ohne Vorbereitung", async () => {
    await expect(fulfillInitialPurchase(client(), purchase)).resolves.toMatchObject({
      buyerIsMember: true,
    });
    expect(db.payments).toHaveLength(1);
    expect(db.narration_settings).toHaveLength(0);
  });

  it("erfüllt den Kauf auch, wenn das Speichern der Einstellungen scheitert", async () => {
    addDraft();
    options = {
      failOn: (op, table) => (op === "insert" && table === "narration_settings" ? "kaputt" : null),
    };
    await expect(fulfillInitialPurchase(client(), purchase)).resolves.toMatchObject({
      buyerIsMember: true,
    });
    expect(db.payments).toHaveLength(1);
  });
});
