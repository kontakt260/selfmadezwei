import { describe, expect, it } from "vitest";
import {
  INITIAL_WIZARD_STATE,
  buildSteps,
  changeForWhom,
  changeNarrationEmail,
  narrationIsActive,
  normalizeMobileNumber,
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
    ["+49 171 1234567", "+491711234567"],
    ["+49 0171 1234567", "+491711234567"],
    ["0171 1234567", "+491711234567"],
    ["0171/1234567", "+491711234567"],
    ["+43 664 1234567", "+436641234567"],
    ["+41 79 123 45 67", "+41791234567"],
    ["+31 6 12345678", "+31612345678"],
    ["+1 415 555 2671", "+14155552671"],
  ])("%s", (raw, expected) => {
    expect(normalizeMobileNumber(raw)).toBe(expected);
  });

  it.each(["", "171", "030 1234567", "+49 30 1234567", "keine Nummer"])("lehnt „%s“ ab", (raw) => {
    expect(normalizeMobileNumber(raw)).toBeNull();
  });
});

describe("validateStep: Erzähl-Impulse", () => {
  it("verlangt bei „Nur per Sprachnachricht“ einen Kontakt", () => {
    const errors = validateStep("narration", { ...phoneGift, narrationEnabled: false }, logged);
    expect(errors.narrationEmail).toBeTruthy();
  });

  it("akzeptiert eine gültige E-Mail ohne weitere Bestätigung", () => {
    expect(
      validateStep("narration", { ...phoneGift, narrationEmail: "oma@example.test" }, logged),
    ).toEqual({});
  });

  it("prüft bei „beides“ beide Felder", () => {
    const errors = validateStep(
      "narration",
      { ...phoneGift, narrationChannel: "both", narrationEmail: "oma@example.test", narrationPhone: "123" },
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
      { ...phoneGift, narrationEmail: "oma@example.test", narrationPhone: "0171 1234567" },
      "self",
      logged,
    );
    expect(next.narrationEmail).toBe(logged.buyerEmail);
    expect(next.narrationPhone).toBe("");
  });

  it("behält nach Geschenk, eigenem Kauf und neuem Geschenk nicht die alte Einladungsadresse", () => {
    const oma = changeNarrationEmail(
      state({ forWhom: "gift", giftMode: "phone-plus-computer", giftRecipientName: "Oma" }),
      "oma@example.test",
    );
    const self = changeForWhom(oma, "self", logged);
    expect(self.giftRecipientEmail).toBe("");
    const opa = changeNarrationEmail(changeForWhom(self, "gift", logged), "opa@example.test");
    expect(opa.giftRecipientEmail).toBe("opa@example.test");
  });

  it("behält die Daten, wenn derselbe Weg erneut gewählt wird", () => {
    const current = { ...phoneGift, narrationEmail: "oma@example.test" };
    expect(changeForWhom(current, "gift", logged)).toBe(current);
  });

  it("hält die Impulse bei „Nur per Sprachnachricht“ immer aktiv", () => {
    expect(narrationIsActive({ ...phoneGift, narrationEnabled: false })).toBe(true);
  });
});

describe("validateStep: Längen", () => {
  it("nennt beim eigenen Namen direkt die Grenze", () => {
    expect(validateStep("name", state({ fullName: "a".repeat(120) }), guest)).toEqual({});
    expect(validateStep("name", state({ fullName: "a".repeat(121) }), guest).fullName).toContain(
      "höchstens 120 Zeichen",
    );
  });

  it("nennt beim Namen der beschenkten Person direkt die Grenze", () => {
    const errors = validateStep(
      "gift-details",
      state({ giftMode: "phone-only", giftRecipientName: "a".repeat(121) }),
      guest,
    );
    expect(errors.giftRecipientName).toContain("höchstens 120 Zeichen");
  });

  it("lehnt eine zu lange E-Mail-Adresse ab", () => {
    const email = `${"a".repeat(250)}@example.test`;
    expect(
      validateStep(
        "gift-computer",
        state({ forWhom: "gift", giftMode: "phone-plus-computer", giftRecipientEmail: email }),
        guest,
      ).giftRecipientEmail,
    ).toBeTruthy();
  });
});

describe("changeNarrationEmail", () => {
  const computer = state({ forWhom: "gift", giftMode: "phone-plus-computer" });

  it("füllt die Adresse für das Geschenk mit", () => {
    expect(changeNarrationEmail(computer, "oma@example.test").giftRecipientEmail).toBe(
      "oma@example.test",
    );
  });

  it("zieht eine spätere Korrektur mit", () => {
    const first = changeNarrationEmail(computer, "oma@example.tes");
    expect(changeNarrationEmail(first, "oma@example.test").giftRecipientEmail).toBe(
      "oma@example.test",
    );
  });

  it("überschreibt keine bewusst andere Adresse", () => {
    const current = {
      ...changeNarrationEmail(computer, "oma@example.test"),
      giftRecipientEmail: "andere@example.test",
    };
    expect(changeNarrationEmail(current, "neu@example.test").giftRecipientEmail).toBe(
      "andere@example.test",
    );
  });

  it("füllt beim Kauf für sich selbst nichts mit", () => {
    expect(
      changeNarrationEmail(state({ forWhom: "self" }), "ich@example.test").giftRecipientEmail,
    ).toBe("");
  });
});
