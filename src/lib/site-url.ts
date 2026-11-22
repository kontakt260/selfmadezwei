// PROJ-19 — die eine Quelle für die Adresse der App.
//
// Gilt für Auth-Weiterleitungen, Mail-Links und die Stripe-Rückleitung. Beim
// Deployment stellt die Konfigurationsprüfung sicher, dass der Wert gesetzt ist.
// Nur lokal gibt es einen Ersatzwert, auch für einen lokalen Production-Build.

const LOCAL_SITE_URL = "http://localhost:3000";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!process.env.VERCEL) return LOCAL_SITE_URL;
  throw new Error("NEXT_PUBLIC_SITE_URL fehlt.");
}
