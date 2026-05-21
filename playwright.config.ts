import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Dummy-Werte für PROJ-6 Webhook-Tests, damit die Route ihre
      // 3-Linien-Verteidigung (Sig → Idempotenz → Service-Role) lokal
      // durchläuft, ohne dass echte Stripe/Supabase-Calls passieren.
      // Echte Stripe-Roundtrips werden manuell gegen Stage getestet.
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? 'sk_test_e2e_dummy',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_e2e_dummy',
      STRIPE_PRICE_ID_INITIAL: process.env.STRIPE_PRICE_ID_INITIAL ?? 'price_e2e_initial',
      STRIPE_PRICE_ID_RENEWAL: process.env.STRIPE_PRICE_ID_RENEWAL ?? 'price_e2e_renewal',
      STRIPE_PRICE_ID_VAPI_60: process.env.STRIPE_PRICE_ID_VAPI_60 ?? 'price_e2e_vapi',
    },
  },
})
