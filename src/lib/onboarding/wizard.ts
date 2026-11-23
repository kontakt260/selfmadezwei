import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/mobile";

// PROJ-24: Regeln des Kauf-Assistenten. Reine Logik ohne Oberfläche, damit
// Browser und später der Server dieselben Prüfungen verwenden. Bewusst ohne
// Zod: Zod prüft im Browser per `new Function`, ob es Code erzeugen darf, und
// löst damit auf jeder Seite eine Meldung der Content-Security-Policy aus.

export type ForWhom = "self" | "gift";
export type GiftMode = "phone-only" | "phone-plus-computer";
export type RecipientRole = "projektleiter" | "co_author";
export type NarrationChannel = "email" | "sms" | "both";
export type PhoneCountry = "DE" | "AT" | "CH";
export type StepId =
  | "for-whom"
  | "name"
  | "gift-details"
  | "narration"
  | "gift-computer"
  | "purchase";

export const PHONE_COUNTRIES: ReadonlyArray<{ id: PhoneCountry; label: string }> = [
  { id: "DE", label: "Deutschland (+49)" },
  { id: "AT", label: "Österreich (+43)" },
  { id: "CH", label: "Schweiz (+41)" },
];

export type WizardState = {
  fullName: string;
  forWhom: ForWhom | null;
  giftRecipientName: string;
  giftMode: GiftMode | null;
  giftRecipientEmail: string;
  giftRecipientRole: RecipientRole;
  buyerWantsAccess: boolean;
  narrationEnabled: boolean;
  narrationChannel: NarrationChannel;
  narrationEmail: string;
  narrationPhoneCountry: PhoneCountry;
  narrationPhone: string;
  narrationConsent: boolean;
};

const STEP_IDS: readonly string[] = [
  "for-whom",
  "name",
  "gift-details",
  "narration",
  "gift-computer",
  "purchase",
];

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && STEP_IDS.includes(value);
}

export function isPhoneCountry(value: unknown): value is PhoneCountry {
  return value === "DE" || value === "AT" || value === "CH";
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

/** Prüft Daten aus dem Browser-Speicher, bevor sie wieder ins Formular kommen. */
export function isWizardState(value: unknown): value is WizardState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isText(v.fullName, 200) &&
    (v.forWhom === null || v.forWhom === "self" || v.forWhom === "gift") &&
    isText(v.giftRecipientName, 200) &&
    (v.giftMode === null || v.giftMode === "phone-only" || v.giftMode === "phone-plus-computer") &&
    isText(v.giftRecipientEmail, 320) &&
    (v.giftRecipientRole === "projektleiter" || v.giftRecipientRole === "co_author") &&
    typeof v.buyerWantsAccess === "boolean" &&
    typeof v.narrationEnabled === "boolean" &&
    (v.narrationChannel === "email" || v.narrationChannel === "sms" || v.narrationChannel === "both") &&
    isText(v.narrationEmail, 320) &&
    isPhoneCountry(v.narrationPhoneCountry) &&
    isText(v.narrationPhone, 40) &&
    typeof v.narrationConsent === "boolean"
  );
}

export type FieldKey =
  | "forWhom"
  | "fullName"
  | "giftRecipientName"
  | "giftMode"
  | "giftRecipientEmail"
  | "narrationEmail"
  | "narrationPhone"
  | "narrationConsent";
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type WizardContext = {
  /** E-Mail des angemeldeten Kontos, bei Gästen leer. */
  buyerEmail: string;
  isGuest: boolean;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const INITIAL_WIZARD_STATE: WizardState = {
  fullName: "",
  forWhom: null,
  giftRecipientName: "",
  giftMode: null,
  giftRecipientEmail: "",
  giftRecipientRole: "co_author",
  buyerWantsAccess: true,
  narrationEnabled: true,
  narrationChannel: "email",
  narrationEmail: "",
  narrationPhoneCountry: "DE",
  narrationPhone: "",
  narrationConsent: false,
};

export function buildSteps(state: WizardState, skipForWhom: boolean): StepId[] {
  const steps: StepId[] = skipForWhom ? ["name"] : ["for-whom", "name"];
  if (state.forWhom === "gift") steps.push("gift-details");
  steps.push("narration");
  if (state.forWhom === "gift" && state.giftMode === "phone-plus-computer") {
    steps.push("gift-computer");
  }
  steps.push("purchase");
  return steps;
}

/** Bei „Nur per Sprachnachricht" gibt es ohne Erzähl-Impulse keinen Weg zum Buch. */
export function narrationIsRequired(state: WizardState): boolean {
  return state.forWhom === "gift" && state.giftMode === "phone-only";
}

export function narrationIsActive(state: WizardState): boolean {
  return narrationIsRequired(state) || state.narrationEnabled;
}

/** Gäste, die für sich kaufen, bekommen die Impulse an die Adresse aus der Zahlung. */
export function narrationUsesCheckoutEmail(state: WizardState, isGuest: boolean): boolean {
  return isGuest && state.forWhom === "self";
}

export function channelUsesEmail(channel: NarrationChannel): boolean {
  return channel !== "sms";
}

export function channelUsesSms(channel: NarrationChannel): boolean {
  return channel !== "email";
}

/** Liefert die Handynummer im internationalen Format oder `null`, wenn sie ungültig ist. */
export function normalizeMobileNumber(country: PhoneCountry, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, country as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function narrationErrors(state: WizardState, context: WizardContext): FieldErrors {
  if (!narrationIsActive(state)) return {};
  const errors: FieldErrors = {};
  if (
    channelUsesEmail(state.narrationChannel) &&
    !narrationUsesCheckoutEmail(state, context.isGuest) &&
    !isValidEmail(state.narrationEmail)
  ) {
    errors.narrationEmail = "Bitte geben Sie eine gültige E-Mail-Adresse an.";
  }
  if (
    channelUsesSms(state.narrationChannel) &&
    !normalizeMobileNumber(state.narrationPhoneCountry, state.narrationPhone)
  ) {
    errors.narrationPhone = "Bitte geben Sie eine gültige Handynummer an, zum Beispiel 0171 1234567.";
  }
  if (state.forWhom === "gift" && !state.narrationConsent) {
    errors.narrationConsent = `Bitte bestätigen Sie, dass ${state.giftRecipientName.trim()} einverstanden ist.`;
  }
  return errors;
}

export function validateStep(
  step: StepId,
  state: WizardState,
  context: WizardContext,
): FieldErrors {
  switch (step) {
    case "for-whom":
      return state.forWhom ? {} : { forWhom: "Bitte treffen Sie eine Auswahl." };
    case "name":
      return state.fullName.trim().length < 2
        ? { fullName: "Bitte geben Sie Ihren Namen an (mind. 2 Zeichen)." }
        : {};
    case "gift-details": {
      const errors: FieldErrors = {};
      if (state.giftRecipientName.trim().length < 2) {
        errors.giftRecipientName = "Bitte geben Sie den Namen der beschenkten Person an.";
      }
      if (!state.giftMode) errors.giftMode = "Bitte wählen Sie, wie erzählt werden soll.";
      return errors;
    }
    case "narration":
      return narrationErrors(state, context);
    case "gift-computer": {
      const email = state.giftRecipientEmail.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return { giftRecipientEmail: "Bitte geben Sie eine gültige E-Mail-Adresse an." };
      }
      if (email === context.buyerEmail.trim().toLowerCase()) {
        return {
          giftRecipientEmail: "Bitte geben Sie eine andere E-Mail-Adresse an als Ihre eigene.",
        };
      }
      return {};
    }
    default:
      return {};
  }
}

/**
 * Wechselt den Weg. Angaben zur beschenkten Person gehen dabei nicht in den
 * Kauf für sich selbst über, die eigene Adresse ist dort vorbefüllt.
 */
export function changeForWhom(
  state: WizardState,
  forWhom: ForWhom,
  context: WizardContext,
): WizardState {
  if (state.forWhom === forWhom) return state;
  return {
    ...state,
    forWhom,
    narrationEnabled: true,
    narrationChannel: "email",
    narrationEmail: forWhom === "self" ? context.buyerEmail : "",
    narrationPhoneCountry: "DE",
    narrationPhone: "",
    narrationConsent: false,
  };
}

/** Das Einverständnis gilt nur für die Person, deren Name dabei angegeben war. */
export function changeRecipientName(state: WizardState, name: string): WizardState {
  if (state.giftRecipientName === name) return state;
  return { ...state, giftRecipientName: name, narrationConsent: false };
}

/** Übernimmt die E-Mail aus den Erzähl-Impulsen in die Portal-Einladung. */
export function prefillInvitationEmail(state: WizardState): WizardState {
  if (
    state.forWhom !== "gift" ||
    state.giftMode !== "phone-plus-computer" ||
    state.giftRecipientEmail.trim() ||
    !narrationIsActive(state) ||
    !channelUsesEmail(state.narrationChannel)
  ) {
    return state;
  }
  return { ...state, giftRecipientEmail: state.narrationEmail.trim() };
}

export function narrationSummary(state: WizardState): string {
  if (!narrationIsActive(state)) return "Keine";
  const channel =
    state.narrationChannel === "both"
      ? "Per E-Mail und SMS"
      : state.narrationChannel === "sms"
        ? "Per SMS"
        : "Per E-Mail";
  return `${channel}, jeden Sonntag`;
}
