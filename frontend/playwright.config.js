import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3055';
const API = 'http://localhost:5055';

/**
 * Browser end-to-end tests. `npm run test:e2e` starts an isolated stack (in-memory MongoDB + seeded
 * demo data + API on :5055 + web on :3055), so no real database or SMS is touched. OTP is 123456.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared test database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-stack.js',
      cwd: '../backend',
      url: `${API}/ready`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx vite --port 3055 --strictPort',
      url: WEB,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: `${API}/api/v1`, VITE_SOCKET_URL: API, VITE_SENTRY_DSN: '', VITE_FIREBASE_API_KEY: '' },
    },
  ],
});
