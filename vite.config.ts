/// <reference types="vitest" />
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const isMountedWindowsWorkspace = process.cwd().startsWith('/mnt/')

/** Los headers de seguridad viven en vercel.json; `npm run preview` los aplica para probar el build como en producción. */
function readVercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers?: Array<{ headers: Array<{ key: string; value: string }> }>
  }

  return Object.fromEntries((config.headers ?? []).flatMap((rule) => rule.headers.map((header) => [header.key, header.value])))
}

const COPYRIGHT_BANNER = `/*! Yu-Gi-Oh! Probability Lab © ${new Date().getFullYear()} Gastón Valles. Todos los derechos reservados. Sitio no oficial: Yu-Gi-Oh! es una marca de Konami. */`

/** Aviso de autoría al principio de cada archivo JS del build. Se agrega después de minificar, así ningún paso lo borra. */
function copyrightBanner(): Plugin {
  return {
    name: 'copyright-banner',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          file.code = `${COPYRIGHT_BANNER}\n${file.code}`
        }
      }
    },
  }
}

/** En desarrollo, sirve las funciones de api/ como las despliega Vercel: un `GET(request)` con la firma Web por archivo. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const name = url.pathname.replace(/^\//, '')

        if (!/^[a-z0-9-]+$/.test(name)) {
          res.statusCode = 404
          res.end()
          return
        }

        try {
          const module = await server.ssrLoadModule(`/api/${name}.ts`)
          const response: Response = await module.GET(new Request(url))

          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.config.logger.error(String(error))
          res.statusCode = 500
          res.end()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyrightBanner(), devApi()],
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
