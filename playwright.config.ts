import { defineConfig, devices } from '@playwright/test'
import { testServerEnv } from './tests/helpers/server-env.mjs'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // Alle Suites arbeiten auf demselben QA-Testprojekt in der Stage-DB
  // (Titel, Kapitel). Parallele Worker würden sich gegenseitig den
  // Zustand ändern — deshalb strikt nacheinander.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
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
    env: testServerEnv({ rateLimit: process.env.E2E_RATE_LIMIT === '1' }),
  },
})
