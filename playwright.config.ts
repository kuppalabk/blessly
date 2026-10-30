import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: 'Asia/Kolkata', locale: 'en-GB', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } }, testMatch: /layout|pwa/ }
  ],
  webServer: [{ command: 'node e2e/mock-whatsapp.cjs', url: 'http://localhost:3199/health', reuseExistingServer: false }, { command: 'node e2e/mock-oidc.cjs', url: 'http://localhost:3198/health', reuseExistingServer: false }, {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell',
      APP_URL: `http://localhost:${PORT}`,
      CRON_SECRET: 'e2e-cron-secret',
      RATE_LIMIT_SCALE: '50',
      // Test-only Web Push key pair (generated with npm run push:keys; not used anywhere else).
      VAPID_PUBLIC_KEY: 'BFHPiKDEC2kFyS5Dfs-vpXd8Y5EX5j-EDVhD7EJ4t-oggP6XhrRht-akuE9QbQ-dqq94xUPckXYttcmwcro2nLI',
      VAPID_PRIVATE_KEY: '3mH1W9l1e1Ao9aXELpGSLYHMiDAp0PmQgqlGkbRqgv4',
      VAPID_SUBJECT: 'mailto:e2e@example.com',
      // Business: WhatsApp calls go to the local mock of Meta's Graph API.
      WHATSAPP_API_BASE: 'http://localhost:3199',
      WHATSAPP_APP_SECRET: 'e2e-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'e2e-verify-token',
      ENCRYPTION_KEY: 'ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzItYnl0ZXM=',
      BILLING_TEST_MODE: '1',
      UPLOAD_DIR: 'test-results/uploads',
      // Google sign-in goes to the local mock OpenID provider; phone codes are shown on screen.
      GOOGLE_CLIENT_ID: 'e2e-google', GOOGLE_CLIENT_SECRET: 'e2e-secret',
      OIDC_GOOGLE_AUTH_URL: 'http://localhost:3198/authorize', OIDC_GOOGLE_TOKEN_URL: 'http://localhost:3198/token',
      OIDC_GOOGLE_JWKS_URL: 'http://localhost:3198/jwks', OIDC_GOOGLE_ISSUER: 'http://localhost:3198',
      SMS_DEV_CODES: '1',
      MONEY_FEATURES: '1',
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }]
});
