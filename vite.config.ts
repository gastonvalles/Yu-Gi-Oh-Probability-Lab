/// <reference types="vitest" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const isMountedWindowsWorkspace = process.cwd().startsWith('/mnt/')

/**
 * Los headers de seguridad viven en vercel.json; `npm run preview` los aplica para probar el build como en producción.
 * Los Cache-Control no: son reglas por carpeta (`/assets`, `/mascot`...) y acá se juntan todas en un solo objeto, así que `preview` serviría hasta el index.html como cacheable.
 */
function readVercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers?: Array<{ headers: Array<{ key: string; value: string }> }>
  }

  return Object.fromEntries(
    (config.headers ?? []).flatMap((rule) => rule.headers.filter((header) => header.key.toLowerCase() !== 'cache-control').map((header) => [header.key, header.value])),
  )
}

const COPYRIGHT_BANNER = `/*! YGOUltraLab © ${new Date().getFullYear()} Gastón Valles. Todos los derechos reservados. Sitio no oficial: Yu-Gi-Oh! es una marca de Konami. */`

/** En desarrollo y en `preview` las imágenes de las cartas pasan por Vite, como en producción pasan por la función `api/card-image`. */
const CARD_IMAGE_PROXY = {
  '/api/card-image': {
    target: 'https://images.ygoprodeck.com',
    changeOrigin: true,
    // Sin el `?w=` de las miniaturas: en producción lo atiende la función (achica con sharp), acá la imagen sale entera.
    rewrite: (path: string) => path.replace(/^\/api\/card-image/, '/images').replace(/\?.*$/, ''),
  },
}

/**
 * En desarrollo `/api/live` (una función de Vercel) la atiende Vite con el mismo código, así las transmisiones en vivo se ven sin desplegar.
 * Sólo en `npm run dev`: el build y `preview` no la llevan (en producción la sirve Vercel).
 */
function liveApiDev(): Plugin {
  return {
    name: 'live-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/live', (request, response) => {
        void (async () => {
          const { GET } = (await server.ssrLoadModule('/api/live.ts')) as { GET: (request: Request) => Promise<Response> }
          const result = await GET(new Request(`http://localhost${request.originalUrl ?? '/api/live'}`))

          response.statusCode = result.status
          result.headers.forEach((value, key) => response.setHeader(key, value))
          response.end(await result.text())
        })()
      })
    },
  }
}

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

/**
 * `virtual:public-assets`: los archivos de `public/` (menos los precios, que son datos) con su tamaño, para el catálogo de assets de /playground.
 * Es una lista armada al leer la carpeta: un archivo nuevo aparece solo, nadie tiene que anotarlo.
 */
function publicAssetsList(): Plugin {
  const id = 'virtual:public-assets'
  const resolved = `\0${id}`

  return {
    name: 'public-assets-list',
    resolveId: (source) => (source === id ? resolved : undefined),
    load(source) {
      if (source !== resolved) return undefined

      const root = fileURLToPath(new URL('./public', import.meta.url))
      const files = (readdirSync(root, { recursive: true }) as string[])
        .map((path) => path.split('\\').join('/'))
        .filter((path) => !path.startsWith('prices/') && statSync(`${root}/${path}`).isFile())
        .sort()
        .map((path) => ({ path: `/${path}`, bytes: statSync(`${root}/${path}`).size }))

      return `export default ${JSON.stringify(files)}`
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyrightBanner(), publicAssetsList(), liveApiDev()],
  preview: {
    headers: readVercelHeaders(),
    proxy: CARD_IMAGE_PROXY,
  },
  server: {
    proxy: CARD_IMAGE_PROXY,
    watch: isMountedWindowsWorkspace
      ? {
          usePolling: true,
          interval: 150,
        }
      : undefined,
  },
  // El worker del Lab se arma como módulo (como ya se lo crea: `type: 'module'`): así puede bajar el inglés aparte, sin llevarlo adentro (con el formato de siempre, `iife`, un `import()` se pega en el mismo archivo).
  worker: { format: 'es' },
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
    setupFiles: ['./src/i18n/test-setup.ts', './src/test-setup.ts'],
  },
})
