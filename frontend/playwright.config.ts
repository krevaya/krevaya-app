import { execFileSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

// Workers inherit the runner's environment, so the ports are picked once here and
// every worker sees the same ones. Set them yourself to reuse servers you started.
function freePort() {
  const js = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"
  return execFileSync(process.execPath, ['-e', js]).toString()
}
process.env.E2E_API_PORT ||= freePort()
process.env.E2E_WEB_PORT ||= freePort()
const api = process.env.E2E_API_PORT
const web = process.env.E2E_WEB_PORT
const CI = !!process.env.CI

// system Chrome locally; CI sets PW_CHANNEL= (empty) to use the bundled chromium
const channel = process.env.PW_CHANNEL ?? 'chrome'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${web}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ...(channel && channel !== 'chromium' ? { channel } : {}),
  },
  projects: [
    // the first account on a fresh server becomes the admin, so sign-up runs before anything else
    { name: 'accounts', testMatch: /accounts\.spec\.ts/ },
    { name: 'app', testIgnore: /accounts\.spec\.ts/, dependencies: ['accounts'] },
  ],
  webServer: [
    {
      command: './e2e/start-api.sh',
      url: `http://127.0.0.1:${api}/api/health`,
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 60_000,
      // lets the script delete its temp database on the way out
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${web} --strictPort`,
      url: `http://localhost:${web}`,
      env: { API_URL: `http://127.0.0.1:${api}` },
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 60_000,
      stdout: 'ignore',
    },
  ],
})
