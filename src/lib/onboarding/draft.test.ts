import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "./draft";
import { INITIAL_WIZARD_STATE } from "./wizard";

const draft: OnboardingDraft = {
  stepId: "purchase",
  state: { ...INITIAL_WIZARD_STATE, fullName: "Max Muster", forWhom: "self" },
};

describe("Zwischenspeicher des Onboardings", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("stellt Eingaben und Schritt wieder her", () => {
    saveOnboardingDraft("konto-a", draft);
    expect(loadOnboardingDraft("konto-a")).toEqual(draft);
  });

  it("führt den Entwurf eines Gastes nach der Anmeldung weiter", () => {
    saveOnboardingDraft(null, draft);
    expect(loadOnboardingDraft("konto-a")).toEqual(draft);
  });

  it("zeigt den Entwurf nicht einem anderen Konto und löscht ihn", () => {
    saveOnboardingDraft("konto-a", draft);
    expect(loadOnboardingDraft("konto-b")).toBeNull();
    expect(loadOnboardingDraft("konto-a")).toBeNull();
  });

  it("zeigt den Entwurf eines Kontos nach dem Abmelden nicht mehr", () => {
    saveOnboardingDraft("konto-a", draft);
    expect(loadOnboardingDraft(null)).toBeNull();
  });

  it("verwirft Entwürfe, die älter als einen Tag sind", () => {
    const start = 1_000_000;
    saveOnboardingDraft("konto-a", draft, start);
    expect(loadOnboardingDraft("konto-a", start + 25 * 60 * 60 * 1000)).toBeNull();
  });

  it("verwirft beschädigte Daten", () => {
    window.sessionStorage.setItem("narravit.onboarding.v1", "{kaputt");
    expect(loadOnboardingDraft("konto-a")).toBeNull();
    expect(window.sessionStorage.getItem("narravit.onboarding.v1")).toBeNull();
  });

  it("löscht den Entwurf", () => {
    saveOnboardingDraft("konto-a", draft);
    clearOnboardingDraft();
    expect(loadOnboardingDraft("konto-a")).toBeNull();
  });
});
