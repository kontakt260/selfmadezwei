// PROJ-24: Bewusst ohne weitere Abhängigkeiten, weil die Navigation auf jeder
// Seite den Zwischenspeicher beim Abmelden löscht.

export const ONBOARDING_DRAFT_KEY = "narravit.onboarding.v2";

export function clearOnboardingDraft(): void {
  try {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // Nichts zu tun, wenn der Speicher nicht verfügbar ist.
  }
}
