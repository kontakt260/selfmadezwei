// PROJ-19 — Sicherheits-Header für jede Antwort der App.
//
// Wird von `next.config.ts` geladen und darf deshalb keine App-Module und keine
// `@/`-Pfade importieren.
//
// Die Content-Security-Policy hat zwei Teile:
//   - Ein kleiner Kern ist aktiv. Er bricht nichts und schützt sofort.
//   - Der Rest läuft im Beobachtungsmodus (Report-Only). Der Browser meldet
//     Verstöße nur in der Konsole und blockiert nichts.

export type SecurityHeader = { key: string; value: string };

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const SUPABASE_ORIGIN = "https://*.supabase.co";

const ENFORCED_CSP = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"];

function reportOnlyCsp(isDevelopment: boolean): string[] {
  return [
    "default-src 'self'",
    // Next.js braucht Inline-Skripte, der Dev-Server zusätzlich eval.
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} ${TURNSTILE_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: für die lokale Vorschau hochgeladener Bilder.
    `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGIN} wss://*.supabase.co${isDevelopment ? " ws:" : ""}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "worker-src 'self' blob:",
    "form-action 'self'",
  ];
}

export function buildSecurityHeaders(input: {
  isDevelopment: boolean;
  /** HTTPS erzwingen nur auf Vercel, nie auf localhost. */
  isDeployed: boolean;
}): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "origin-when-cross-origin" },
    // PROJ-12 gibt das Mikrofon später nur auf den Aufnahme-Routen frei.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy", value: ENFORCED_CSP.join("; ") },
    {
      key: "Content-Security-Policy-Report-Only",
      value: reportOnlyCsp(input.isDevelopment).join("; "),
    },
  ];

  if (input.isDeployed) {
    // Bewusst ohne `preload`: Das ließe sich kaum rückgängig machen.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}
