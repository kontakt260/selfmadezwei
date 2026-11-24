import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { INITIAL_WIZARD_STATE, type WizardState } from "@/lib/onboarding/wizard";
import { StepPurchase } from "./WizardSteps";

const UNLOCK = "Mit dem Kauf schalten wir Ihr Projekt frei und Sie können sofort loslegen.";

const state = (patch: Partial<WizardState>): WizardState => ({
  ...INITIAL_WIZARD_STATE,
  fullName: "Karla Käufer",
  ...patch,
});

describe("StepPurchase: Untertitel der letzten Seite", () => {
  it("nennt das sofortige Loslegen, wenn man angemeldet für sich selbst kauft", () => {
    render(<StepPurchase state={state({ forWhom: "self" })} isGuest={false} />);
    expect(screen.getByText(UNLOCK)).toBeInTheDocument();
  });

  it("hat keinen Untertitel, wenn man angemeldet ein Geschenk kauft", () => {
    for (const giftMode of ["phone-only", "phone-plus-computer"] as const) {
      const { unmount } = render(
        <StepPurchase state={state({ forWhom: "gift", giftMode, giftRecipientName: "Oma Helga" })} isGuest={false} />,
      );
      expect(screen.getByRole("heading", { name: "Bereit zum Start?" })).toBeInTheDocument();
      expect(screen.queryByText(UNLOCK)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("behält die Hinweise für Gäste", () => {
    const { unmount } = render(
      <StepPurchase
        state={state({ forWhom: "gift", giftMode: "phone-plus-computer", buyerWantsAccess: false })}
        isGuest
      />,
    );
    expect(screen.getByText(/senden wir das Geschenk direkt an die beschenkte Person/)).toBeInTheDocument();
    unmount();
    render(<StepPurchase state={state({ forWhom: "gift", giftMode: "phone-only" })} isGuest />);
    expect(screen.getByText(/legen Sie in einem kurzen Schritt Ihr Konto an/)).toBeInTheDocument();
  });
});
