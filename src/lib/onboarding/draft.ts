import { ONBOARDING_DRAFT_KEY, clearOnboardingDraft } from "./draft-key";
import { isStepId, isWizardState, type StepId, type WizardState } from "./wizard";

export { clearOnboardingDraft };

// PROJ-24: Zwischenspeicher des Kauf-Assistenten. Die Angaben bleiben nur in
// diesem Browser-Tab und gehören zu dem Konto, das sie eingegeben hat.

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type OnboardingDraft = { stepId: StepId; state: WizardState };

type StoredDraft = OnboardingDraft & { ownerId: string | null; savedAt: number };

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.ownerId === null || typeof v.ownerId === "string") &&
    typeof v.savedAt === "number" &&
    isStepId(v.stepId) &&
    isWizardState(v.state)
  );
}

export function saveOnboardingDraft(
  ownerId: string | null,
  draft: OnboardingDraft,
  now: number = Date.now(),
): void {
  try {
    window.sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ ownerId, savedAt: now, ...draft }),
    );
  } catch {
    // Ohne Speicher funktioniert der Assistent weiter, nur ohne Wiederherstellung.
  }
}

/**
 * Ein Entwurf ohne Konto darf nach der Anmeldung weitergeführt werden. Der
 * Entwurf eines Kontos ist für alle anderen tabu und wird dann gelöscht.
 */
export function loadOnboardingDraft(
  ownerId: string | null,
  now: number = Date.now(),
): OnboardingDraft | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!isStoredDraft(parsed)) {
    clearOnboardingDraft();
    return null;
  }

  const foreign = parsed.ownerId !== null && parsed.ownerId !== ownerId;
  if (foreign || now - parsed.savedAt > MAX_AGE_MS) {
    clearOnboardingDraft();
    return null;
  }
  return { stepId: parsed.stepId, state: parsed.state };
}
