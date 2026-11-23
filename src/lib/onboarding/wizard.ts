import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";

// PROJ-24: Regeln des Kauf-Assistenten. Reine Logik ohne Oberfläche, damit
// Browser und später der Server dieselben Prüfungen verwenden. Bewusst ohne
// Zod: Zod prüft im Browser per `new Function`, ob es Code erzeugen darf, und
// löst damit auf jeder Seite eine Meldung der Content-Security-Policy aus.

export type ForWhom = "self" | "gift";
export type GiftMode = "phone-only" | "phone-plus-computer";
export type RecipientRole = "projektleiter" | "co_author";
export type NarrationChannel = "email" | "sms" | "both";
export type StepId =
  | "for-whom"
  | "name"
  | "gift-details"
  | "narration"
  | "gift-computer"
  | "purchase";

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
  narrationPhone: string;
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
    isText(v.narrationPhone, 40)
  );
}

export type FieldKey =
  | "forWhom"
  | "fullName"
  | "giftRecipientName"
  | "giftMode"
  | "giftRecipientEmail"
  | "narrationEmail"
  | "narrationPhone";
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type WizardContext = {
  /** E-Mail des angemeldeten Kontos, bei Gästen leer. */
  buyerEmail: string;
  isGuest: boolean;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Dieselben Längen prüft der Server beim Kauf. */
export const NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 254;
export const PHONE_MAX_LENGTH = 40;

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
  narrationPhone: "",
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

/**
 * Liefert die Handynummer im internationalen Format oder `null`, wenn sie
 * ungültig ist. Eine Nummer ohne + wird als deutsche Nummer gelesen.
 */
export function normalizeMobileNumber(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, "DE");
  return parsed?.isValid() ? parsed.number : null;
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
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
  if (channelUsesSms(state.narrationChannel) && !normalizeMobileNumber(state.narrationPhone)) {
    errors.narrationPhone =
      "Bitte geben Sie eine gültige Handynummer mit Ländervorwahl an, zum Beispiel +49 171 1234567.";
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
      if (state.fullName.trim().length < 2) {
        return { fullName: "Bitte geben Sie Ihren Namen an (mind. 2 Zeichen)." };
      }
      return state.fullName.length > NAME_MAX_LENGTH
        ? { fullName: `Bitte kürzen Sie Ihren Namen auf höchstens ${NAME_MAX_LENGTH} Zeichen.` }
        : {};
    case "gift-details": {
      const errors: FieldErrors = {};
      if (state.giftRecipientName.trim().length < 2) {
        errors.giftRecipientName = "Bitte geben Sie den Namen der beschenkten Person an.";
      } else if (state.giftRecipientName.length > NAME_MAX_LENGTH) {
        errors.giftRecipientName = `Bitte kürzen Sie den Namen auf höchstens ${NAME_MAX_LENGTH} Zeichen.`;
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
 * Wechselt den Weg. Kontaktangaben gehen dabei nicht auf den neuen Weg über,
 * damit eine Einladung nie an eine frühere Adresse geht. Beim Kauf für sich
 * selbst ist die eigene Adresse vorbefüllt.
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
    narrationPhone: "",
    giftRecipientEmail: "",
  };
}

/**
 * Die E-Mail aus den Erzähl-Impulsen füllt auch die Adresse für das Geschenk,
 * solange dort keine eigene, abweichende Adresse eingetragen wurde.
 */
export function changeNarrationEmail(state: WizardState, email: string): WizardState {
  const inSync =
    !state.giftRecipientEmail.trim() || state.giftRecipientEmail === state.narrationEmail;
  return {
    ...state,
    narrationEmail: email,
    giftRecipientEmail:
      inSync && state.forWhom === "gift" ? email : state.giftRecipientEmail,
  };
}
