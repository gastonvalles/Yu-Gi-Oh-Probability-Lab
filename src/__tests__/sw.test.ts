import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GENERATION, serviceWorkerOff, serviceWorkerSource } from '../../scripts/sw-source.mjs'

/**
 * El service worker (src/sw.js) se prueba como sale del build: la plantilla con la lista y la versión escritas por `serviceWorkerSource` (scripts/sw-source.mjs), ejecutada tal cual
 * contra un `self`, un `caches` y un `fetch` de mentira.
 */
const ORIGIN = 'https://ygoul.test'
const TEMPLATE = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const FILES = [
  { path: '/index.html', content: '<html>v1</html>' },
  { path: '/privacidad.html', content: 'privacidad' },
  { path: '/recover.js', content: 'recover' },
  { path: '/favicon.png', content: 'png' },
  { path: '/assets/index-abc123.js' },
  { path: '/assets/LifeCalculatorScreen-def456.js' },
]

/** La red de mentira que sirve cada archivo con el contenido que dice la lista (lo de /assets, con «asset»). */
const contentOf = (input: unknown) => FILES.find((file) => file.path === input)?.content ?? 'asset'
const served = (input: unknown) => new Response(contentOf(input))

type Req = { url: string; method: string; mode: string; cache: string }
type SwEvent = { request?: Req; waitUntil: (promise: Promise<unknown>) => void; respondWith?: (promise: Promise<Response>) => void }
type Store = Map<string, Map<string, Response>>

const request = (path: string, init: Partial<Req> = {}): Req => ({ url: path.startsWith('http') ? path : ORIGIN + path, method: 'GET', mode: 'cors', cache: 'default', ...init })
const href = (key: string | Req) => new URL(typeof key === 'string' ? key : key.url, ORIGIN).href

/** Un CacheStorage en memoria: cada caché es un Map de URL a respuesta, en orden de llegada (como el de verdad). */
function fakeCaches(store: Store = new Map()) {
  const handle = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const entries = store.get(name)!

    return {
      match: async (key: string | Req) => entries.get(href(key))?.clone(),
      put: async (key: string | Req, response: Response) => {
        entries.delete(href(key))
        entries.set(href(key), response)
      },
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (key: string | Req) => entries.delete(href(key)),
    }
  }

  return { open: vi.fn(async (name: string) => handle(name)), keys: async () => [...store.keys()], delete: async (name: string) => store.delete(name) }
}

function boot({ files = FILES, off = false, store = new Map() as Store, network = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response('red')) } = {}) {
  let code = serviceWorkerSource(TEMPLATE, files)

  if (off) {
    // La línea que cambia la PR del botón de pánico (el comentario de cabecera la nombra también).
    expect(code.match(/^const OFF = false$/gm)).toHaveLength(1)
    expect(serviceWorkerOff(code)).toBe(false)
    code = code.replace(/^const OFF = false$/m, 'const OFF = true')
    // Y el build se lo avisa a la página, que deja de registrarlo.
    expect(serviceWorkerOff(code)).toBe(true)
  }

  const listeners: Record<string, (event: SwEvent) => void> = {}
  const tab = { url: `${ORIGIN}/#deck-builder`, navigate: vi.fn(async () => null) }
  const self = {
    addEventListener: (type: string, listener: (event: SwEvent) => void) => void (listeners[type] = listener),
    skipWaiting: vi.fn(async () => {}),
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => [tab]) },
    registration: { unregister: vi.fn(async () => true) },
  }
  const caches = fakeCaches(store)
  const sw = new Function('self', 'caches', 'fetch', `${code}\nreturn { route, VERSION, CACHE }`)(self, caches, network) as {
    route: (request: Req, origin: string) => string | null
    VERSION: string
    CACHE: string
  }

  /** Dispara un evento del ciclo de vida y espera lo que el service worker pidió esperar. */
  const lifecycle = async (type: 'install' | 'activate') => {
    const pending: Array<Promise<unknown>> = []

    listeners[type]!({ waitUntil: (promise) => void pending.push(promise) })
    await Promise.all(pending)
  }

  /** Un pedido de la página: la respuesta del service worker, o undefined si no lo tocó (va a la red como si no estuviera). */
  const intercept = (req: Req) => {
    let answer: Promise<Response> | undefined

    listeners.fetch?.({ request: req, waitUntil: () => {}, respondWith: (promise) => void (answer = promise) })
    return answer
  }

  return { sw, self, listeners, store, caches, network, tab, lifecycle, intercept }
}

/** Instala la versión y deja guardado lo de la lista con el texto «guardado <ruta>». */
function installed(options: Parameters<typeof boot>[0] = {}) {
  const booted = boot(options)
  const cache = new Map(FILES.map((file) => [`${ORIGIN}${file.path}`, new Response(`guardado ${file.path}`)]))

  booted.store.set(booted.sw.CACHE, cache)
  return booted
}

afterEach(() => {
  vi.useRealTimers()
})

describe('el service worker (src/sw.js): qué hace con cada pedido', () => {
  const { sw } = boot()

  it.each([
    ['navegar a la app', request('/', { mode: 'navigate' }), 'page'],
    ['navegar a /index.html', request('/index.html', { mode: 'navigate' }), 'page'],
    ['navegar a la app con un hash o un query', request('/?ref=x', { mode: 'navigate' }), 'page'],
    ['navegar al catálogo', request('/playground/buttons', { mode: 'navigate' }), 'page'],
    ['navegar a la política de privacidad', request('/privacy.html', { mode: 'navigate' }), 'page'],
    ['navegar a la 404', request('/404.html', { mode: 'navigate' }), 'page'],
    ['un archivo de /assets de la lista', request('/assets/index-abc123.js'), 'precache'],
    ['un archivo de public/ de la lista', request('/favicon.png'), 'precache'],
    ['un archivo de la lista pedido salteando el caché (recover.js, refreshAssets)', request('/assets/index-abc123.js', { cache: 'reload' }), null],
    ['un pesado de /assets (no está en la lista)', request('/assets/ocgcore.sync-DM8qz6pI.wasm'), null],
    ['un chunk de una versión vieja', request('/assets/index-viejo00.js'), null],
    ['la mascota', request('/mascot/cupsy/idle.webp'), 'static'],
    ['un cosmético', request('/cosmetics/coin/heads.webp'), 'static'],
    ['/build.json (el QA espera el deploy con él)', request('/build.json'), null],
    ['/build.json navegando', request('/build.json', { mode: 'navigate' }), null],
    ['los datos del duelo automático', request('/auto-data/manifest'), null],
    ['las transmisiones en vivo', request('/api/live'), null],
    ['el dashboard de TI', request('/api/ti/state'), null],
    ['el arte de una carta', request('/api/card-image/cards/123.jpg'), null],
    ['los precios', request('/prices/cards.json'), null],
    ['las capturas del manifest', request('/pwa/inicio.jpg'), null],
    ['robots.txt', request('/robots.txt'), null],
    ['sitemap.xml', request('/sitemap.xml'), null],
    ['un POST (el reporte de un problema)', request('/api/bug', { method: 'POST' }), null],
    ['un POST a una ruta de la lista', request('/index.html', { method: 'POST' }), null],
    ['otro origen: el arte de YGOPRODeck', request('https://images.ygoprodeck.com/images/cards/123.jpg'), null],
    ['otro origen: el catálogo', request('https://db.ygoprodeck.com/api/v7/cardinfo.php'), null],
    ['otro origen navegando', request('https://www.youtube-nocookie.com/embed/x', { mode: 'navigate' }), null],
  ])('%s → %s', (_name, req, how) => {
    expect(sw.route(req, ORIGIN)).toBe(how)
  })

  it('lo que no toca, ni lo intercepta: el navegador lo pide como si no hubiera service worker', () => {
    const { intercept } = boot()

    expect(intercept(request('/build.json'))).toBeUndefined()
    expect(intercept(request('/api/bug', { method: 'POST' }))).toBeUndefined()
    expect(intercept(request('https://images.ygoprodeck.com/x.jpg'))).toBeUndefined()
    expect(intercept(request('/assets/index-abc123.js', { cache: 'reload' }))).toBeUndefined()
  })
})

describe('el service worker: install', () => {
  it('baja toda la lista y guarda sólo respuestas ok; lo que lleva hash puede salir del caché HTTP y lo demás se revalida', async () => {
    const { lifecycle, store, sw, network, self } = boot({ network: vi.fn(async (input: unknown) => served(input)) })

    await lifecycle('install')

    expect(self.skipWaiting).toHaveBeenCalled()
    expect([...store.get(sw.CACHE)!.keys()].sort()).toEqual(FILES.map((file) => `${ORIGIN}${file.path}`).sort())
    // El index.html con el contenido que dice la lista se guarda tal cual, sin reintentos.
    expect(await store.get(sw.CACHE)!.get(`${ORIGIN}/index.html`)!.text()).toBe('<html>v1</html>')
    expect(network).toHaveBeenCalledTimes(FILES.length)
    expect(network).toHaveBeenCalledWith('/assets/index-abc123.js', { cache: 'default' })
    expect(network).toHaveBeenCalledWith('/index.html', { cache: 'no-cache' })
    expect(sw.CACHE).toBe(`ygoul-sw-${sw.VERSION}`)
  })

  it('un 404 (el desfase de justo después de un deploy) se reintenta salteando el caché, y si llega se guarda', async () => {
    const network = vi.fn(async (input: unknown, init?: RequestInit) => (input === '/assets/index-abc123.js' && init?.cache !== 'reload' ? new Response('no', { status: 404 }) : served(input)))
    const { lifecycle, store, sw } = boot({ network })

    await lifecycle('install')

    expect(network).toHaveBeenCalledWith('/assets/index-abc123.js', { cache: 'reload' })
    expect(await store.get(sw.CACHE)!.get(`${ORIGIN}/assets/index-abc123.js`)!.text()).toBe('asset')
  })

  it('si el reintento también da 404, la instalación entera falla y no queda nada guardado (el navegador reintenta en la próxima visita)', async () => {
    const network = vi.fn(async (input: unknown) => (input === '/recover.js' ? new Response('no', { status: 404 }) : served(input)))
    const { lifecycle, store, sw } = boot({ network })

    await expect(lifecycle('install')).rejects.toThrow('/recover.js 404')
    expect(store.has(sw.CACHE)).toBe(false)
  })

  it('lo que no lleva hash en el nombre se verifica: con otro contenido se reintenta salteando el caché, y si llega el correcto se guarda', async () => {
    const network = vi.fn(async (input: unknown, init?: RequestInit) => (input === '/index.html' && init?.cache !== 'reload' ? new Response('<html>de otra versión</html>') : served(input)))
    const { lifecycle, store, sw } = boot({ network })

    await lifecycle('install')

    expect(network).toHaveBeenCalledWith('/index.html', { cache: 'reload' })
    expect(await store.get(sw.CACHE)!.get(`${ORIGIN}/index.html`)!.text()).toBe('<html>v1</html>')
  })

  it('si el contenido sigue sin coincidir tras el reintento, la instalación entera falla y no queda caché', async () => {
    const network = vi.fn(async (input: unknown) => (input === '/recover.js' ? new Response('alterado') : served(input)))
    const { lifecycle, store, sw } = boot({ network })

    await expect(lifecycle('install')).rejects.toThrow('/recover.js sha256')
    expect(network).toHaveBeenCalledWith('/recover.js', { cache: 'reload' })
    expect(store.has(sw.CACHE)).toBe(false)
  })

  it('sin red la instalación falla', async () => {
    const { lifecycle } = boot({ network: vi.fn(async () => Promise.reject(new TypeError('offline'))) })

    await expect(lifecycle('install')).rejects.toThrow('offline')
  })

  it('una respuesta redirigida se guarda sin la marca (con ella no podría contestar una navegación)', async () => {
    const redirected = new Response('<html>v1</html>')

    Object.defineProperty(redirected, 'redirected', { value: true })
    const { lifecycle, store, sw } = boot({ network: vi.fn(async (input: unknown) => (input === '/index.html' ? redirected : served(input))) })

    await lifecycle('install')

    const saved = store.get(sw.CACHE)!.get(`${ORIGIN}/index.html`)!
    expect(saved.redirected).toBe(false)
    expect(await saved.text()).toBe('<html>v1</html>')
  })
})

describe('el service worker: activate', () => {
  it('borra los cachés de las versiones viejas y el de la mascota (se vuelve a llenar al usarse), y no toca los de la app', async () => {
    const store: Store = new Map(['ygoul-sw-viejo0000000', 'ygoul-sw-static', 'ygoprodeck-catalog-v2', 'ygoprodeck-cardinfo-v1', 'auto-data-abc'].map((name) => [name, new Map()]))
    const { lifecycle, sw, self } = boot({ store })

    store.set(sw.CACHE, new Map())
    await lifecycle('activate')

    expect([...store.keys()].sort()).toEqual([sw.CACHE, 'auto-data-abc', 'ygoprodeck-cardinfo-v1', 'ygoprodeck-catalog-v2'].sort())
    expect(self.clients.claim).toHaveBeenCalled()
  })
})

describe('el service worker: las respuestas', () => {
  it('lo de la lista sale del precache, sin red', async () => {
    const { intercept, network } = installed()

    expect(await (await intercept(request('/assets/index-abc123.js')))!.text()).toBe('guardado /assets/index-abc123.js')
    expect(network).not.toHaveBeenCalled()
  })

  it('si falta en el precache, va a la red', async () => {
    const { intercept, store, sw } = installed()

    store.get(sw.CACHE)!.delete(`${ORIGIN}/favicon.png`)
    expect(await (await intercept(request('/favicon.png')))!.text()).toBe('red')
  })

  it('con red, una navegación trae la página de la red', async () => {
    const { intercept } = installed()

    expect(await (await intercept(request('/', { mode: 'navigate' })))!.text()).toBe('red')
  })

  it('sin red, una navegación a la app o al catálogo recibe el index.html de la versión activa, y la de privacidad, su página', async () => {
    const { intercept } = installed({ network: vi.fn(async () => Promise.reject(new TypeError('offline'))) })

    expect(await (await intercept(request('/', { mode: 'navigate' })))!.text()).toBe('guardado /index.html')
    expect(await (await intercept(request('/playground', { mode: 'navigate' })))!.text()).toBe('guardado /index.html')
    expect(await (await intercept(request('/privacidad.html', { mode: 'navigate' })))!.text()).toBe('guardado /privacidad.html')
  })

  it('con la red colgada, a los 3 s la navegación recibe la página guardada', async () => {
    vi.useFakeTimers()
    const { intercept } = installed({ network: vi.fn(() => new Promise<Response>(() => {})) })
    const answer = intercept(request('/', { mode: 'navigate' }))!

    await vi.advanceTimersByTimeAsync(2999)
    let settled = false
    void answer.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(await (await answer).text()).toBe('guardado /index.html')
  })

  it('si algo falla adentro del service worker, el pedido va a la red', async () => {
    const { intercept, caches, network } = installed()

    caches.open.mockRejectedValue(new Error('quota') as never)
    expect(await (await intercept(request('/assets/index-abc123.js')))!.text()).toBe('red')
    expect(network).toHaveBeenCalled()
  })

  it('la mascota: la primera vez de la red (y se guarda); después lo guardado, y se refresca de fondo', async () => {
    const network = vi.fn(async () => new Response('red'))
    const { intercept, store } = boot({ network })
    const idle = request('/mascot/cupsy/idle.webp')

    expect(await (await intercept(idle))!.text()).toBe('red')
    store.get('ygoul-sw-static')!.set(idle.url, new Response('guardado'))
    expect(await (await intercept(idle))!.text()).toBe('guardado')
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('la mascota: no guarda lo que no es un 200 y se queda con las últimas 40', async () => {
    const { intercept, store } = boot({ network: vi.fn(async (input: unknown) => new Response('x', { status: (input as Req).url.endsWith('/404.webp') ? 404 : 200 })) })

    await intercept(request('/mascot/404.webp'))
    for (let index = 0; index < 45; index++) await intercept(request(`/mascot/cupsy/${index}.webp`))

    const kept = [...store.get('ygoul-sw-static')!.keys()]
    expect(kept).toHaveLength(40)
    expect(kept[0]).toBe(`${ORIGIN}/mascot/cupsy/5.webp`)
    expect(kept).not.toContain(`${ORIGIN}/mascot/404.webp`)
  })
})

describe('el service worker: el modo apagado (botón de pánico)', () => {
  it('no intercepta nada, borra sólo sus cachés, se desregistra y recarga las pestañas que controlaba', async () => {
    const store: Store = new Map(['ygoul-sw-viejo0000000', 'ygoul-sw-static', 'ygoprodeck-catalog-v2', 'auto-data-abc'].map((name) => [name, new Map()]))
    const { listeners, lifecycle, self, tab } = boot({ off: true, store })

    expect(listeners.fetch).toBeUndefined()
    await lifecycle('install')
    expect(self.skipWaiting).toHaveBeenCalled()
    expect(store.has('ygoul-sw-dev')).toBe(false)

    await lifecycle('activate')
    expect([...store.keys()].sort()).toEqual(['auto-data-abc', 'ygoprodeck-catalog-v2'])
    expect(self.registration.unregister).toHaveBeenCalled()
    expect(tab.navigate).toHaveBeenCalledWith(tab.url)
  })

  it('se desregistra aunque falle el borrado de los cachés', async () => {
    const { lifecycle, self, caches } = boot({ off: true })

    caches.keys = async () => Promise.reject(new Error('quota'))
    await expect(lifecycle('activate')).rejects.toThrow('quota')
    expect(self.registration.unregister).toHaveBeenCalled()
  })
})

describe('el sw.js del build (serviceWorkerSource)', () => {
  const version = (files: typeof FILES) => boot({ files }).sw.VERSION

  it('escribe la lista ordenada y una versión en los bytes', () => {
    const code = serviceWorkerSource(TEMPLATE, FILES)

    const files = JSON.parse(/^const FILES = (.*)$/m.exec(code)![1]!) as Record<string, string | null>

    expect(Object.keys(files)).toEqual(FILES.map((file) => file.path).sort())
    // Lo de /assets va sin SHA-256 (el nombre ya es el hash); lo demás, con el de su contenido.
    expect(files['/assets/index-abc123.js']).toBeNull()
    expect(files['/index.html']).toBe(createHash('sha256').update('<html>v1</html>').digest('hex'))
    expect(code).toMatch(/const VERSION = '[0-9a-f]{12}'/)
  })

  it('la misma lista da la misma versión; otra lista u otro contenido de lo que no lleva hash, otra', () => {
    const base = version(FILES)

    expect(version([...FILES].reverse())).toBe(base)
    expect(version(FILES.map((file) => (file.path === '/assets/index-abc123.js' ? { path: '/assets/index-zzz999.js' } : file)))).not.toBe(base)
    expect(version(FILES.map((file) => (file.path === '/index.html' ? { ...file, content: '<html>v2</html>' } : file)))).not.toBe(base)
  })

  it('subir GENERATION da otra versión con la misma lista (para un cambio que sólo toca cabeceras)', () => {
    const versionOf = (code: string) => /const VERSION = '([0-9a-f]{12})'/.exec(code)![1]

    expect(versionOf(serviceWorkerSource(TEMPLATE, FILES, GENERATION))).toBe(versionOf(serviceWorkerSource(TEMPLATE, FILES)))
    expect(versionOf(serviceWorkerSource(TEMPLATE, FILES, GENERATION + 1))).not.toBe(versionOf(serviceWorkerSource(TEMPLATE, FILES)))
  })

  it('si la plantilla pierde un marcador, el build falla en vez de emitir un service worker sin lista', () => {
    expect(() => serviceWorkerSource(TEMPLATE.replace('const FILES = {}', 'const FILES = { }'), FILES)).toThrow('const FILES = {}')
  })
})
