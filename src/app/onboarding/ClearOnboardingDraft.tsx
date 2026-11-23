"use client";

import { useEffect } from "react";
import { clearOnboardingDraft } from "@/lib/onboarding/draft-key";

// PROJ-24: Nach dem Kauf dürfen die Angaben nicht im Browser-Tab bleiben.
export function ClearOnboardingDraft() {
  useEffect(() => {
    clearOnboardingDraft();
  }, []);
  return null;
}
