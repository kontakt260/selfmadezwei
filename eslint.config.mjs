// ESLint Flat Config für Next.js 16 (`next lint` existiert dort nicht mehr).
// Aufruf: `npm run lint` → `eslint .`
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Bewusst ungenutzte Parameter/Variablen per Unterstrich markieren
      // (z. B. `_prev` in Server Actions, `_config` im Playwright-Setup).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Claude-Code-Worktrees und lokale Einstellungen
    ".claude/**",
    // Generierte Playwright-Ausgaben und Login-Zustand des Testnutzers
    "playwright-report/**",
    "test-results/**",
    "tests/.auth/**",
    // Aus src/emails/auth erzeugte Supabase-Mail-Vorlagen (HTML)
    "supabase/templates/**",
  ]),
]);
