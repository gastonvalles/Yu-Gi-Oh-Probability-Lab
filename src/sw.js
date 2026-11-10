/*
 * Service worker de YGOUltraLab: la app abre sin conexión (el armazón, «Inicio», el armador, el Lab, la calculadora de LP) y se actualiza sola, sin aviso.
 *
 * Es una plantilla, no un módulo de la app: el plugin `serviceWorker` de vite.config.ts (con scripts/sw-source.mjs) la emite como dist/sw.js con FILES (lo que se
 * precachea, `{ ruta: sha256 }`: el del contenido de lo que no lleva hash en el nombre, que `install` verifica) y VERSION (el hash de esa lista, de esta plantilla y
 * de GENERATION) escritos en los bytes. Otro build da otro sw.js: el navegador lo detecta, la versión nueva se instala, entra sola (skipWaiting + clients.claim) y
 * borra los cachés de las anteriores. `npm run dev` no registra nada (src/main.tsx, sólo en producción).
 * Ojo: un cambio sólo en vercel.json (las cabeceras, la CSP) no cambia VERSION y lo guardado sigue con las cabeceras viejas. Si importa, se sube GENERATION
 * (scripts/sw-source.mjs) o se toca algún archivo de la lista.
 *
 * Qué hace con cada pedido (route): sólo mira GET del mismo origen; lo demás (POST, otros orígenes, WebSockets) va directo a la red.
 * - Navegar a la app (/, /index.html, /playground…) o a privacidad.html, privacy.html y 404.html: primero la red, 3 s; si falla o tarda, la página de la versión activa.
 * - Lo de FILES (/assets livianos, íconos, card-back, foil, el manifest, recover.js): del precache; si falta, la red. Un pedido con `cache: 'reload'` va siempre a
 *   la red: así public/recover.js y refreshAssets siguen pisando un 404 guardado como inmutable.
 * - /mascot y /cosmetics: lo guardado, y se refresca de fondo (hasta STATIC_MAX archivos; cada versión nueva lo vacía y se vuelve a llenar al usarse).
 * - Todo lo demás ni se mira y queda con el caché HTTP de siempre: /build.json, /auto-data, /api (también card-image), /prices, /pwa y los pesados de /assets.
 * Sólo crea y borra cachés `ygoul-sw-*`: los de la app (ygoprodeck-*, auto-data-*) no se tocan. Si algo falla adentro, el pedido va a la red. Un 404 nunca se guarda:
 * si la instalación no consigue un archivo (el desfase de Vercel justo después de un deploy), falla entera y el navegador reintenta en la próxima visita.
 *
 * Botón de pánico: si una versión deja a la gente atrapada (una pantalla rota que no se cura recargando), una PR de una línea cambia `const OFF = false` por
 * `const OFF = true` y se despliega. Al visitar la página, el navegador baja ese sw.js (vercel.json lo sirve con `no-cache`), borra todos los `ygoul-sw-*`, se
 * desregistra y recarga una vez las pestañas abiertas; la página de ese build ya no lo registra (desregistra el que quede: `VITE_SW_OFF` en src/main.tsx). Todo
 * queda con la red, como antes de que hubiera service worker. Se vuelve a `false` con la versión arreglada.
 * Para retirarlo del todo se deja publicado así, en modo OFF: nunca se borra este archivo ni se saca el plugin. Un /sw.js que da 404 no desregistra nada: la
 * versión vieja quedaría instalada para siempre en cada dispositivo que la tenga.
 *
 * Ojo si lo tocás: src/__tests__/sw.test.ts ejecuta la plantilla emitida tal cual.
 */
const VERSION = 'dev'
const FILES = {}
const OFF = false

const PREFIX = 'ygoul-sw-'
const CACHE = PREFIX + VERSION
const STATIC = PREFIX + 'static'
const STATIC_MAX = 40
const NETWORK_MS = 3000
const PRECACHED = new Set(Object.keys(FILES))
const STANDALONE = ['/privacidad.html', '/privacy.html', '/404.html']

/** La página guardada que reemplaza a esta navegación sin conexión (null: no se toca). */
function pageOf(path) {
  if (path === '/' || path === '/index.html' || path === '/playground' || path.startsWith('/playground/')) return '/index.html'
  return STANDALONE.includes(path) ? path : null
}

/** Cómo se atiende un pedido: 'page', 'precache', 'static' o null (no se toca: va a la red como si no hubiera service worker). */
function route(request, origin) {
  if (request.method !== 'GET') return null

  const url = new URL(request.url)

  if (url.origin !== origin) return null
  if (request.mode === 'navigate') return pageOf(url.pathname) ? 'page' : null
  if (PRECACHED.has(url.pathname)) return request.cache === 'reload' ? null : 'precache'
  if (url.pathname.startsWith('/mascot/') || url.pathname.startsWith('/cosmetics/')) return 'static'
  return null
}

function precached(path) {
  return caches.open(CACHE).then((cache) => cache.match(path))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function page(request, key) {
  const network = fetch(request)
  const quick = await Promise.race([network.catch(() => null), sleep(NETWORK_MS)])

  return quick || (await precached(key)) || network
}

async function stale(event) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(event.request)
  const network = fetch(event.request).then(async (response) => {
    if (response.status === 200) {
      await cache.put(event.request, response.clone())
      const keys = await cache.keys()
      await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_MAX)).map((key) => cache.delete(key)))
    }
    return response
  })

  if (!cached) return network
  event.waitUntil(network.catch(() => {}))
  return cached
}

async function respond(how, event) {
  const request = event.request
  const path = new URL(request.url).pathname

  if (how === 'page') return page(request, pageOf(path))
  if (how === 'precache') return (await precached(path)) || fetch(request)
  return stale(event)
}

async function sha256(response) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer())

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Si la respuesta sirve para guardar: `ok` y, si la lista trae su SHA-256, con ese contenido (no el de otra versión ni uno alterado). */
async function valid(response, digest) {
  return response.ok && (!digest || (await sha256(response)) === digest)
}

/**
 * Baja y guarda toda la lista: sólo respuestas `ok` y, lo que no lleva hash en el nombre, con el contenido que dice la lista. Si no, se reintenta salteando el
 * caché HTTP y, si sigue mal, la instalación entera falla.
 */
async function install() {
  const cache = await caches.open(CACHE)

  try {
    await Promise.all(
      Object.entries(FILES).map(async ([path, digest]) => {
        // Lo que lleva hash es inmutable: puede salir del caché HTTP. Lo que no (index.html, recover.js…) se revalida, para que sea el de esta versión.
        let response = await fetch(path, { cache: digest ? 'no-cache' : 'default' })

        if (!(await valid(response, digest))) response = await fetch(path, { cache: 'reload' })
        if (!(await valid(response, digest))) throw new Error(path + ' ' + (response.ok ? 'sha256' : response.status))
        // Una respuesta redirigida no puede contestar una navegación: se guarda una copia sin la marca.
        await cache.put(path, response.redirected ? new Response(await response.blob(), response) : response)
      }),
    )
  } catch (error) {
    await caches.delete(CACHE)
    throw error
  }
}

async function activate() {
  const names = await caches.keys()

  // También el de la mascota (STATIC): se vuelve a llenar al usarse, y así no arrastra archivos viejos para siempre.
  await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)))
  await self.clients.claim()
}

/** Modo apagado: borra todo lo suyo, se desregistra (aunque no haya podido borrar) y recarga las pestañas que controlaba (las que no, ni se enteran: no hay bucle). */
async function shutDown() {
  try {
    const names = await caches.keys()

    await Promise.all(names.filter((name) => name.startsWith(PREFIX)).map((name) => caches.delete(name)))
  } finally {
    await self.registration.unregister()
  }
  const windows = await self.clients.matchAll({ type: 'window' })
  await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})))
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  if (!OFF) event.waitUntil(install())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(OFF ? shutDown() : activate())
})

if (!OFF) {
  self.addEventListener('fetch', (event) => {
    const how = route(event.request, self.location.origin)

    if (how) event.respondWith(respond(how, event).catch(() => fetch(event.request)))
  })
}
