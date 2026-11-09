// Smoke de solo lectura contra el sitio PUBLICADO (`npm run test:prod`), después de cada deploy. Sin servidores propios: el e2e local del duelo
// (relay y Vite en esta máquina) es `playwright.config.ts` y no corre esto (`testIgnore`).
//   BASE_URL    otro sitio (por defecto producción); también un preview de Vercel.
//   EXPECT_SHA  antes de probar espera (hasta 10 min) a que `/build.json` sirva ese commit (`e2e/prod/esperar-build.ts`).
//   TI_DIR      carpeta del tablero donde el reporter anota la línea `qa` (`.claude/ti/contrato-eventos.md`).
import { defineConfig, devices } from '@playwright/test'

const SUFFIX = 'YGOUltraLab-QA'

export default defineConfig({
  testDir: 'e2e/prod',
  globalSetup: './e2e/prod/esperar-build.ts',
  // Una repetición y nada más; dos navegadores a la vez.
  retries: 1,
  workers: 2,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['./e2e/prod/qa-reporter.ts']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL || 'https://yu-gi-oh-probability-lab.vercel.app',
    browserName: 'chromium',
    locale: 'es-AR',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { userAgent: `${devices['Pixel 7'].userAgent} ${SUFFIX}`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { userAgent: `${devices['Desktop Chrome'].userAgent} ${SUFFIX}`, viewport: { width: 1440, height: 900 } },
    },
  ],
})
