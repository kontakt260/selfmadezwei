import { describe, expect, it } from "vitest";
import {
  INITIAL_WIZARD_STATE,
  buildSteps,
  changeForWhom,
  changeRecipientName,
  narrationIsActive,
  narrationSummary,
  normalizeMobileNumber,
  prefillInvitationEmail,
  validateStep,
  type WizardState,
} from "./wizard";

const logged = { buyerEmail: "kaeufer@example.test", isGuest: false };
const guest = { buyerEmail: "", isGuest: true };
const state = (patch: Partial<WizardState>): WizardState => ({
  ...INITIAL_WIZARD_STATE,
  ...patch,
});
const phoneGift = state({
  forWhom: "gift",
  giftMode: "phone-only",
  giftRecipientName: "Oma Helga",
});

describe("buildSteps", () => {
  it("führt „Für mich selbst“ über die Erzähl-Impulse", () => {
    expect(buildSteps(state({ forWhom: "self" }), false)).toEqual([
      "for-whom",
      "name",
      "narration",
      "purchase",
    ]);
  });

  it("zeigt beim Geschenk mit Computer alle Schritte", () => {
    expect(buildSteps(state({ forWhom: "gift", giftMode: "phone-plus-computer" }), false)).toEqual([
      "for-whom",
      "name",
      "gift-details",
      "narration",
      "gift-computer",
      "purchase",
    ]);
  });

  it("lässt Schritt 1 bei vorbelegtem Weg weg", () => {
    expect(buildSteps(state({ forWhom: "self" }), true)[0]).toBe("name");
  });
});

describe("normalizeMobileNumber", () => {
  it.each([
    ["DE", "0171 1234567", "+491711234567"],
    ["DE", "0171/1234567", "+491711234567"],
    ["DE", "+49 0171 1234567", "+491711234567"],
    ["AT", "0664 1234567", "+436641234567"],
    ["CH", "079 123 45 67", "+41791234567"],
    ["DE", "+43 664 1234567", "+436641234567"],
  ] as const)("%s %s", (country, raw, expected) => {
    expect(normalizeMobileNumber(country, raw)).toBe(expected);
  });

  it.each(["", "171", "030 1234567", "keine Nummer"])("lehnt „%s“ ab", (raw) => {
    expect(normalizeMobileNumber("DE", raw)).toBeNull();
  });
});

describe("validateStep: Erzähl-Impulse", () => {
  it("verlangt bei „Nur per Sprachnachricht“ Kontakt und Einverständnis", () => {
    const errors = validateStep("narration", { ...phoneGift, narrationEnabled: false }, logged);
    expect(errors.narrationEmail).toBeTruthy();
    expect(errors.narrationConsent).toContain("Oma Helga");
  });

  it("akzeptiert eine gültige E-Mail mit Einverständnis", () => {
    expect(
      validateStep(
        "narration",
        { ...phoneGift, narrationEmail: "oma@example.test", narrationConsent: true },
        logged,
      ),
    ).toEqual({});
  });

  it("prüft bei „beides“ beide Felder", () => {
    const errors = validateStep(
      "narration",
      { ...phoneGift, narrationChannel: "both", narrationEmail: "oma@example.test", narrationPhone: "123", narrationConsent: true },
      logged,
    );
    expect(Object.keys(errors)).toEqual(["narrationPhone"]);
  });

  it("verlangt bei Nein nichts", () => {
    expect(
      validateStep(
        "narration",
        state({ forWhom: "gift", giftMode: "phone-plus-computer", narrationEnabled: false }),
        logged,
      ),
    ).toEqual({});
  });

  it("braucht beim Kauf für sich selbst kein Häkchen", () => {
    expect(
      validateStep("narration", state({ forWhom: "self", narrationEmail: "ich@example.test" }), logged),
    ).toEqual({});
  });

  it("fragt Gäste für sich selbst nicht nach der E-Mail", () => {
    expect(validateStep("narration", state({ forWhom: "self" }), guest)).toEqual({});
  });
});

describe("validateStep: Zugang einrichten", () => {
  const computer = state({ forWhom: "gift", giftMode: "phone-plus-computer" });

  it("lehnt eine ungültige E-Mail ab", () => {
    expect(
      validateStep("gift-computer", { ...computer, giftRecipientEmail: "kein-text" }, logged)
        .giftRecipientEmail,
    ).toContain("gültige");
  });

  it("lehnt die eigene Adresse ab", () => {
    expect(
      validateStep("gift-computer", { ...computer, giftRecipientEmail: "KAEUFER@example.test" }, logged)
        .giftRecipientEmail,
    ).toContain("andere");
  });
});

describe("Wegwechsel", () => {
  it("nimmt Kontaktdaten der beschenkten Person nicht in den eigenen Kauf mit", () => {
    const next = changeForWhom(
      { ...phoneGift, narrationEmail: "oma@example.test", narrationPhone: "0171 1234567", narrationConsent: true },
      "self",
      logged,
    );
    expect(next.narrationEmail).toBe(logged.buyerEmail);
    expect(next.narrationPhone).toBe("");
    expect(next.narrationConsent).toBe(false);
  });

  it("behält die Daten, wenn derselbe Weg erneut gewählt wird", () => {
    const current = { ...phoneGift, narrationEmail: "oma@example.test" };
    expect(changeForWhom(current, "gift", logged)).toBe(current);
  });

  it("setzt das Einverständnis zurück, wenn sich der Name ändert", () => {
    const next = changeRecipientName({ ...phoneGift, narrationConsent: true }, "Opa Karl");
    expect(next.narrationConsent).toBe(false);
  });

  it("hält die Impulse bei „Nur per Sprachnachricht“ immer aktiv", () => {
    expect(narrationIsActive({ ...phoneGift, narrationEnabled: false })).toBe(true);
  });
});

describe("prefillInvitationEmail", () => {
  const computer = state({
    forWhom: "gift",
    giftMode: "phone-plus-computer",
    narrationEmail: "oma@example.test",
  });

  it("übernimmt die Adresse aus den Erzähl-Impulsen", () => {
    expect(prefillInvitationEmail(computer).giftRecipientEmail).toBe("oma@example.test");
  });

  it("überschreibt keine eingetragene Adresse", () => {
    const current = { ...computer, giftRecipientEmail: "andere@example.test" };
    expect(prefillInvitationEmail(current).giftRecipientEmail).toBe("andere@example.test");
  });

  it("übernimmt nichts bei „Nur SMS“", () => {
    expect(
      prefillInvitationEmail({ ...computer, narrationChannel: "sms" }).giftRecipientEmail,
    ).toBe("");
  });
});

describe("narrationSummary", () => {
  it.each([
    ["email", "Per E-Mail, jeden Sonntag"],
    ["sms", "Per SMS, jeden Sonntag"],
    ["both", "Per E-Mail und SMS, jeden Sonntag"],
  ] as const)("%s", (narrationChannel, expected) => {
    expect(narrationSummary(state({ forWhom: "self", narrationChannel }))).toBe(expected);
  });

  it("nennt „Keine“ bei Nein", () => {
    expect(narrationSummary(state({ forWhom: "self", narrationEnabled: false }))).toBe("Keine");
  });
});
