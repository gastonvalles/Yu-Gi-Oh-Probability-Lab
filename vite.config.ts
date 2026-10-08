/// <reference types="vitest" />
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const isMountedWindowsWorkspace = process.cwd().startsWith('/mnt/')

/** Los headers de seguridad viven en vercel.json; `npm run preview` los aplica para probar el build como en producción. */
function readVercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers?: Array<{ headers: Array<{ key: string; value: string }> }>
  }

  return Object.fromEntries((config.headers ?? []).flatMap((rule) => rule.headers.map((header) => [header.key, header.value])))
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: readVercelHeaders(),
  },
  server: {
    watch: isMountedWindowsWorkspace
      ? {
          usePolling: true,
          interval: 150,
        }
      : undefined,
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías que casi no cambian: quedan en su propio archivo y se cachean aparte del código de la app.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'react'
          if (id.includes('node_modules/@reduxjs') || id.includes('node_modules/react-redux') || id.includes('node_modules/redux') || id.includes('node_modules/immer') || id.includes('node_modules/reselect')) return 'state'
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
