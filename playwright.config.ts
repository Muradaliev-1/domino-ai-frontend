import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Uçtan uca testler: gerçek backend (../backend, uvicorn) + Vite geliştirme sunucusu + bilgisayardaki Microsoft Edge.
// Backend odaları gelen bağlantı sırasıyla eşleştirdiği için testler tek işçiyle, sırayla koşar.
const BACKEND = Number(process.env.E2E_BACKEND_PORT ?? 8765)
const FRONT = Number(process.env.E2E_FRONT_PORT ?? 5199)

export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    channel: 'msedge',
    headless: true,
    baseURL: `http://127.0.0.1:${FRONT}`,
    viewport: { width: 1280, height: 760 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `python -m uvicorn --app-dir ../backend main:app --host 127.0.0.1 --port ${BACKEND}`,
      url: `http://127.0.0.1:${BACKEND}/`,
      reuseExistingServer: false,
      env: {
        PYTHONUTF8: '1',
        DOMINO_BOT_DELAY: '0.12',
        DOMINO_RECORD_PATH: join(tmpdir(), 'domino-e2e-records.jsonl'),
      },
      timeout: 60_000,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${FRONT} --strictPort`,
      url: `http://127.0.0.1:${FRONT}/`,
      // süreç ortamı .env.development'i ezer: testler yalnız kendi backend'ine bağlanır (8000'deki elle açılmışa değil)
      env: { VITE_WS_URL: `ws://127.0.0.1:${BACKEND}/ws` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
