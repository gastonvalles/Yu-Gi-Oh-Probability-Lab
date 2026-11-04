// Pruebas de punta a punta en un navegador de verdad (`npm run test:e2e`): fuera de `npm test` y del CI.
// Levanta todo en esta máquina, nunca contra producción: el relay local (`wrangler dev`, docs/duelo-relay.md) y la app con Vite
// apuntando a él por el entorno (sin `.env.local`). Puertos poco comunes para no chocar con `npm run dev` (5173) ni con otro relay.
//
// El navegador: `@playwright/test` va fijo en 1.63.0 porque es la versión que pide Chromium 1243, el que ya está en el caché
// (`%LOCALAPPDATA%\ms-playwright\chromium-1243`); subirla pide bajar otro (`npx playwright install chromium`).
// Al terminar Playwright cierra los dos servidores con su árbol de procesos (en Windows, `taskkill /T`): no quedan `workerd` ni Vite.
import { defineConfig, devices } from '@playwright/test'

// Los puertos se pueden cambiar (`E2E_RELAY_PORT`, `E2E_APP_PORT`) para correr dos e2e a la vez sin pisarse; cada relay guarda en su propia carpeta.
const RELAY_PORT = Number(process.env.E2E_RELAY_PORT ?? 8795)
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 5189)
const APP = `http://127.0.0.1:${APP_PORT}`

export default defineConfig({
  testDir: 'e2e',
  // Dos navegadores por prueba contra un solo relay: de a una.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: APP,
    viewport: { width: 1366, height: 768 },
    locale: 'es-AR',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // La ruta de `--persist-to` tiene que ser corta en Windows o falla `SQLITE_CANTOPEN`.
      command: `npx --yes wrangler@4 dev --local --port ${RELAY_PORT} --ip 127.0.0.1 --persist-to C:/tmp/relay-e2e-${RELAY_PORT} --var "ALLOWED_ORIGINS:${APP},http://localhost:${APP_PORT}"`,
      cwd: 'duel-relay',
      url: `http://127.0.0.1:${RELAY_PORT}/rooms`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // El Node que corre Playwright (el mismo que corre las pruebas) levanta Vite.
      command: `"${process.execPath}" node_modules/vite/bin/vite.js --port ${APP_PORT} --strictPort --host 127.0.0.1`,
      url: APP,
      env: { VITE_DUEL_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
