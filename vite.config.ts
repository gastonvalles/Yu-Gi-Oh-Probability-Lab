/// <reference types="vitest" />
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'
import { defineConfig, type Plugin } from 'vite'
import { cardsByCodes, manifestCodes, scriptDirs } from './scripts/build-auto-data.mjs'

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
 * En desarrollo las funciones de Vercel (`api/`) las atiende Vite con el mismo código: `/api/live` (las transmisiones en vivo se ven sin
 * desplegar) y `/api/auto-data`, la de los datos del duelo automático en producción (lee `.auto-data/`, que arma
 * `AUTO_DATA_BUILD=1 node scripts/build-auto-data.mjs`; para que la beta la use en vez de `autoDataDev`: `VITE_AUTO_DATA_URL=/api/auto-data`).
 * Sólo en `npm run dev`: el build y `preview` no las llevan (en producción las sirve Vercel).
 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      for (const name of ['live', 'auto-data']) {
        server.middlewares.use(`/api/${name}`, (request, response) => {
          void (async () => {
            const { GET } = (await server.ssrLoadModule(`/api/${name}.ts`)) as { GET: (request: Request) => Promise<Response> }
            const result = await GET(new Request(`http://localhost${request.originalUrl ?? `/api/${name}`}`))

            response.statusCode = result.status
            result.headers.forEach((value, key) => response.setHeader(key, value))
            response.end(await result.text())
          })()
        })
      }
    },
  }
}

/**
 * Duelos automáticos en desarrollo (sólo `vite serve`: nada de esto llega al build). Sirve los datos del núcleo desde las carpetas de
 * `npm run sync:core` (`CORE_DATA_DIR` con `cards.cdb` y `CARD_SCRIPTS_DIR` con los scripts; ninguna está en el repo) con las rutas que
 * lee `httpSource` (`src/app/auto/auto-data.ts`): `/auto-data/manifest`, `/auto-data/cards?codes=…` y `/auto-data/script/<nombre>`
 * (404 si no existe); y la consola de pruebas `/__auto/` (`src/app/auto/dev-console.ts`). Las respuestas van con gzip, como las daría un CDN.
 * Las filas, el manifiesto y el orden de búsqueda de los scripts son las funciones de `scripts/build-auto-data.mjs`, las mismas con las
 * que el build arma los datos de producción (`api/auto-data.ts`).
 */
function autoDataDev(): Plugin {
  return {
    name: 'auto-data-dev',
    apply: 'serve',
    configureServer(server) {
      const dataDir = process.env.CORE_DATA_DIR ?? join(tmpdir(), 'ygo-lab-core-data')
      const scriptsDir = process.env.CARD_SCRIPTS_DIR ?? join(tmpdir(), 'ygo-lab-card-scripts')
      const cdb = join(dataDir, 'cards.cdb')
      // `node:sqlite` se carga recién al primer pedido (avisa que es experimental en Node 22).
      let db: Promise<import('node:sqlite').DatabaseSync> | null = null
      const open = () => (db ??= import('node:sqlite').then(({ DatabaseSync }) => new DatabaseSync(cdb, { readOnly: true })))
      const scriptFile = (name: string) => scriptDirs(name).map((dir: string) => join(scriptsDir, dir, name)).find((file: string) => existsSync(file))
      const reply = (request: { headers: Record<string, string | string[] | undefined> }, response: import('node:http').ServerResponse, status: number, type: string, body: string) => {
        response.statusCode = status
        response.setHeader('Content-Type', type)
        response.setHeader('Cache-Control', 'no-cache')
        if (!/\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''))) return response.end(body)
        response.setHeader('Content-Encoding', 'gzip')
        response.end(gzipSync(body))
      }
      let manifest: Promise<string> | null = null
      const buildManifest = async () => {
        const head = join(scriptsDir, '.git', 'HEAD')
        const ref = existsSync(head) ? readFileSync(head, 'utf8').trim() : ''
        const refFile = ref.startsWith('ref: ') ? join(scriptsDir, '.git', ref.slice(5)) : ''
        const commit = refFile && existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : ref
        const stat = statSync(cdb)

        return JSON.stringify({ version: createHash('sha1').update(`${stat.size}:${stat.mtimeMs}:${commit}`).digest('hex').slice(0, 12), ...manifestCodes(await open(), (name: string) => scriptFile(name) !== undefined) })
      }

      server.middlewares.use('/auto-data', (request, response) => {
        void (async () => {
          try {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const script = /^\/script\/([\w.-]+\.lua)$/.exec(decodeURIComponent(url.pathname))

            if (url.pathname === '/manifest') return reply(request, response, 200, 'application/json', await (manifest ??= buildManifest()))
            if (url.pathname === '/cards') {
              const codes = (url.searchParams.get('codes') ?? '').split(',').filter((code) => /^\d{1,10}$/.test(code)).slice(0, 2000).map(Number)

              return reply(request, response, 200, 'application/json', JSON.stringify(cardsByCodes(await open(), codes)))
            }
            const file = script ? scriptFile(script[1]!) : undefined

            if (file) return reply(request, response, 200, 'text/plain; charset=utf-8', readFileSync(file, 'utf8'))
            reply(request, response, 404, 'text/plain', 'not found')
          } catch (error) {
            reply(request, response, 500, 'text/plain', String(error))
          }
        })()
      })

      server.middlewares.use('/__auto', (request, response, next) => {
        if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/') return next()
        const html = '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Auto duel console</title></head><body><script type="module" src="/src/app/auto/dev-console.ts"></script></body></html>'

        void server.transformIndexHtml(request.originalUrl ?? '/__auto/', html).then((body) => {
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(body)
        }, next)
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

/** Las pruebas que redefinen `window.location` (ver `projects` abajo). */
const REDEFINE_LOCATION = ['src/__tests__/asset-recovery.test.ts', 'src/__tests__/error-boundary.test.tsx', 'src/__tests__/i18n.test.tsx']
/** Las pruebas lentas (el fuzz del núcleo de reglas): fuera de `npm test`; las corre `npm run test:auto`, que es lo único que suma su proyecto. */
const SLOW = 'src/__tests__/**/*.slow.test.ts'
const SLOW_RUN = process.env.npm_lifecycle_event === 'test:auto'

export default defineConfig({
  plugins: [react(), tailwindcss(), copyrightBanner(), publicAssetsList(), apiDev(), autoDataDev()],
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
    // Los 5 s de Vitest alcanzan sobrados en una máquina quieta, pero con varias suites a la vez (o los archivos grandes de UI en paralelo) una prueba sana llega a pasarlos: más margen, que sólo se gasta si algo falla.
    testTimeout: 15_000,
    setupFiles: ['./src/i18n/test-setup.ts', './src/test-setup.ts'],
    projects: [
      // Casi todo corre en `vmForks`: cada archivo tiene su propio contexto de V8 y se salta crear un proceso nuevo (y cargar jsdom) por archivo; medido, la suite entera baja de ~107 s a ~80 s
      // y el trabajo de CPU, un tercio (con varios agentes corriendo suites a la vez, es lo que se nota).
      { extends: true, test: { name: 'vm', pool: 'vmForks', exclude: [...configDefaults.exclude, ...REDEFINE_LOCATION, SLOW] } },
      // En un contexto de `vm` `window.location` no se puede redefinir (`Cannot redefine property: location`): las pruebas que lo hacen para ver si la pantalla recarga siguen en procesos propios (`forks`).
      // Si una prueba nueva falla con ese error, se suma acá.
      { extends: true, test: { name: 'forks', pool: 'forks', include: REDEFINE_LOCATION } },
      ...(SLOW_RUN ? [{ extends: true as const, test: { name: 'slow', pool: 'forks' as const, include: [SLOW] } }] : []),
    ],
  },
})
