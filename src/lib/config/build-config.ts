// PROJ-19 — prüft die Konfiguration beim Build.
//
// Fehlt ein Pflichtwert, bricht der Build ab und die laufende Version bleibt
// online. So geht eine falsche Konfiguration gar nicht erst live.
//
// Wird von `next.config.ts` geladen und darf deshalb keine App-Module und keine
// `@/`-Pfade importieren. Meldungen nennen nur Namen von Variablen, nie Werte.
//
// Neue Pflichtvariable: hier in REQUIRED_VARIABLES und in `.env.local.example`
// eintragen, dann erst verwenden.

export const CUSTOMER_SITE_URL = "https://app.narravit.de";

export const REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID_INITIAL",
  "STRIPE_PRICE_ID_RENEWAL",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
] as const;

const TEST_SWITCHES = ["EMAIL_TEST_RECIPIENT", "RATE_LIMIT_DISABLED"] as const;

/** Die öffentlichen Testschlüssel von Cloudflare Turnstile. */
const TURNSTILE_TEST_KEY = /^[123]x0+[A-Z]{2}$/;
const STRIPE_LIVE_KEY = /^(sk|rk)_live_/;

export type BuildEnvironment = "customer" | "stage" | "local";
export type BuildEnv = Record<string, string | undefined>;

export type BuildConfigResult = {
  environment: BuildEnvironment;
  errors: string[];
  warnings: string[];
};

function value(env: BuildEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function normalizedSiteUrl(env: BuildEnv): string {
  return value(env, "NEXT_PUBLIC_SITE_URL").replace(/\/+$/, "");
}

/**
 * `NODE_ENV` hilft hier nicht: Es steht auch auf Stage auf „production".
 * Im Zweifel gelten die strengen Regeln der Kunden-Umgebung.
 */
export function detectBuildEnvironment(env: BuildEnv): BuildEnvironment {
  if (
    value(env, "VERCEL_GIT_COMMIT_REF") === "main" ||
    value(env, "VERCEL_ENV") === "production" ||
    normalizedSiteUrl(env) === CUSTOMER_SITE_URL
  ) {
    return "customer";
  }
  return value(env, "VERCEL") ? "stage" : "local";
}

export function checkBuildConfig(env: BuildEnv): BuildConfigResult {
  const environment = detectBuildEnvironment(env);
  const errors: string[] = [];
  const warnings: string[] = [];

  const missing = REQUIRED_VARIABLES.filter((name) => !value(env, name));
  if (missing.length > 0) {
    const message = `Pflichtwerte fehlen: ${missing.join(", ")}`;
    if (environment === "local") warnings.push(message);
    else errors.push(message);
  }

  if (environment === "customer") {
    if (normalizedSiteUrl(env) !== CUSTOMER_SITE_URL) {
      errors.push(`NEXT_PUBLIC_SITE_URL muss ${CUSTOMER_SITE_URL} sein.`);
    }

    const stripeKey = value(env, "STRIPE_SECRET_KEY");
    if (stripeKey && !STRIPE_LIVE_KEY.test(stripeKey)) {
      errors.push("STRIPE_SECRET_KEY muss ein Live-Schlüssel sein.");
    }

    if (TURNSTILE_TEST_KEY.test(value(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY"))) {
      errors.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY ist ein Testschlüssel.");
    }

    const switches = TEST_SWITCHES.filter((name) => value(env, name));
    if (switches.length > 0) {
      errors.push(`Test-Schalter müssen entfernt werden: ${switches.join(", ")}`);
    }
  }

  if (environment !== "local" && !value(env, "WELCOME_DISCOUNT_CODE")) {
    warnings.push("WELCOME_DISCOUNT_CODE fehlt, die Willkommens-Mail kommt ohne Rabattcode.");
  }

  return { environment, errors, warnings };
}

/** Gibt Warnungen aus und bricht den Build bei Fehlern ab. */
export function assertBuildConfig(
  env: BuildEnv,
  warn: (message: string) => void = console.warn,
): void {
  const { environment, errors, warnings } = checkBuildConfig(env);
  for (const warning of warnings) warn(`[build-config] ${warning}`);
  if (errors.length > 0) {
    throw new Error(
      `Konfiguration für „${environment}" ist unvollständig:\n- ${errors.join("\n- ")}`,
    );
  }
}
