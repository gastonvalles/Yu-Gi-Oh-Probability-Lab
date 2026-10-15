// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assetUrlsOf, refreshAssets } from '../app/asset-recovery'
import { orReload } from '../components/deck-mode/lazy-steps'

// Con jsdom el URL del archivo no sirve para leer del disco: se lee desde la raíz del proyecto (donde corre vitest).
const text = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const CHUNK = 'https://yu-gi-oh-probability-lab.vercel.app/assets/mascot-CbFR5RsL.js'
const STYLE = 'https://yu-gi-oh-probability-lab.vercel.app/assets/index-D9kxBLZ7.css'

describe('el script de arranque (public/recover.js): un archivo que falló se vuelve a bajar sin caché y se recarga', () => {
  const code = text('public/recover.js')

  /** Ejecuta el script tal cual está, contra una ventana de mentira que deja ver qué hace. */
  function boot(storage: Pick<Storage, 'getItem' | 'setItem'> | null = new Map<string, string>() as never) {
    const store = new Map<string, string>()
    const memory = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
    const listeners: Array<{ type: string; listener: (event: unknown) => void; capture: unknown }> = []
    const win = {
      addEventListener: (type: string, listener: (event: unknown) => void, capture: unknown) => listeners.push({ type, listener, capture }),
      fetch: vi.fn(async () => ({ status: 200 })),
      location: { reload: vi.fn() },
      sessionStorage: storage === null ? undefined : storage && 'size' in storage ? memory : storage,
      setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
    }

    new Function('window', code)(win)

    const error = listeners.find((entry) => entry.type === 'error')!
    const fail = (tagName: string, url: string) => error.listener({ target: { tagName, src: url, href: url } })

    return { win, listeners, error, fail, store }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('escucha los errores en la fase de captura: los de un <script> o un <link> no suben por el árbol', () => {
    const { error } = boot()

    expect(error.capture).toBe(true)
  })

  it('junta los archivos que fallaron a la vez, los baja de nuevo salteando el caché (uno por uno, sin repetir) y recarga una sola vez', async () => {
    const { win, fail } = boot()

    fail('SCRIPT', CHUNK)
    fail('LINK', STYLE)
    fail('SCRIPT', CHUNK)
    expect(win.fetch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(win.fetch.mock.calls).toEqual([[CHUNK, { cache: 'reload' }], [STYLE, { cache: 'reload' }]])
    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('un fallo de red al volver a bajarlos no impide recargar', async () => {
    const { win, fail } = boot()

    win.fetch.mockRejectedValue(new TypeError('offline') as never)
    fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(300)

    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('no recarga en bucle: pasado el primer intento espera un minuto antes de volver a probar', async () => {
    const { win, fail, store } = boot()

    fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(300)
    expect(Number(store.get('ygo-lab:asset-heal'))).toBeGreaterThan(0)

    // La página recargada vuelve a fallar enseguida: no se vuelve a intentar.
    await vi.advanceTimersByTimeAsync(10_000)
    fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(1000)
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(win.fetch).toHaveBeenCalledTimes(1)

    // Pasado el minuto, sí.
    await vi.advanceTimersByTimeAsync(60_000)
    fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(300)
    expect(win.location.reload).toHaveBeenCalledTimes(2)
  })

  it('sólo mira scripts y hojas de estilo de /assets: una imagen, un archivo de otra carpeta o un error de la propia ventana no recargan nada', async () => {
    const { win, error, fail } = boot()

    fail('IMG', 'https://yu-gi-oh-probability-lab.vercel.app/assets/logo-abc123.png')
    fail('SCRIPT', 'https://yu-gi-oh-probability-lab.vercel.app/otra-cosa/app.js')
    fail('SCRIPT', 'https://cdn.example.com/lib.js')
    error.listener({ target: win, message: 'Script error.' })
    error.listener({ target: null })
    await vi.advanceTimersByTimeAsync(5000)

    expect(win.fetch).not.toHaveBeenCalled()
    expect(win.location.reload).not.toHaveBeenCalled()
  })

  it('si no hay dónde recordar que ya lo intentó, no hace nada (no podría evitar un bucle)', async () => {
    const none = boot(null)
    none.fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(1000)
    expect(none.win.location.reload).not.toHaveBeenCalled()

    const throwing = boot({ getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    throwing.fail('SCRIPT', CHUNK)
    await vi.advanceTimersByTimeAsync(1000)
    expect(throwing.win.location.reload).not.toHaveBeenCalled()
    expect(throwing.win.fetch).not.toHaveBeenCalled()
  })
})

describe('el HTML carga el script de arranque antes que la app, y la política de contenido lo permite', () => {
  it('va dentro del head y antes del módulo de la app (Vite lo pasa al head: si el script va después, el error llega antes de que escuche), es un archivo propio y existe en public/', () => {
    const html = text('index.html')
    const recover = html.indexOf('<script src="/recover.js"></script>')

    expect(recover).toBeGreaterThan(html.indexOf('<head>'))
    expect(recover).toBeLessThan(html.indexOf('</head>'))
    expect(recover).toBeLessThan(html.indexOf('<script type="module"'))
    expect(text('public/recover.js').length).toBeGreaterThan(100)
  })

  it('no es un script en línea: la política de contenido sigue sin `unsafe-inline` para scripts', () => {
    const csp = (JSON.parse(text('vercel.json')) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> }).headers
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === 'Content-Security-Policy')
      .map((header) => header.value)

    expect(csp.length).toBeGreaterThan(0)
    for (const policy of csp) {
      expect(/script-src ([^;]*)/.exec(policy)![1]).not.toContain('unsafe-inline')
      expect(/script-src ([^;]*)/.exec(policy)![1]).toContain("'self'")
    }
  })
})

describe('la misma cura para las pantallas que se cargan al usarlas (después del arranque)', () => {
  it('assetUrlsOf saca de un error de carga los archivos de /assets que nombra', () => {
    expect(assetUrlsOf(new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`))).toEqual([CHUNK])
    expect(assetUrlsOf(new Error(`error loading dynamically imported module: ${CHUNK}?v=3`))).toEqual([CHUNK])
    expect(assetUrlsOf(new Error(`Unable to preload CSS for ${STYLE} and ${CHUNK} (${CHUNK})`))).toEqual([STYLE, CHUNK])
    expect(assetUrlsOf('Failed to fetch dynamically imported module: https://otro.example/lib/x.js')).toEqual([])
  })

  it('si el error no dice cuál (Safari), se usan los archivos que el navegador ya había pedido por adelantado', () => {
    document.head.innerHTML = `<link rel="modulepreload" href="${CHUNK}"><link rel="modulepreload" href="https://cdn.example.com/x.js"><link rel="stylesheet" href="${STYLE}">`

    expect(assetUrlsOf(new TypeError('Importing a module script failed.'))).toEqual([CHUNK])
    document.head.innerHTML = ''
    expect(assetUrlsOf(new TypeError('Importing a module script failed.'))).toEqual([])
  })

  it('refreshAssets los baja de nuevo salteando el caché y un fallo de red no corta nada', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ status: 200 }).mockRejectedValueOnce(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshAssets([CHUNK, STYLE])).resolves.toBeUndefined()
    expect(fetchMock.mock.calls).toEqual([[CHUNK, { cache: 'reload' }], [STYLE, { cache: 'reload' }]])
    vi.unstubAllGlobals()
  })

  describe('orReload: si una pantalla no carga, pisa lo que falló y recarga una vez', () => {
    const reload = vi.fn()

    beforeEach(() => {
      sessionStorage.clear()
      reload.mockReset()
      vi.stubGlobal('location', { ...window.location, reload })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('el archivo que falló se baja de nuevo y recién cuando termina se recarga, y recargar una segunda vez no se intenta', async () => {
      // La bajada tarda: si se recargara sin esperarla, la recarga la cortaría y el 404 guardado seguiría ahí.
      let finish: () => void = () => {}
      const fetchMock = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
      vi.stubGlobal('fetch', fetchMock)
      const failing = orReload(async () => {
        throw new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`)
      })

      void failing()
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(CHUNK, { cache: 'reload' }))
      await Promise.resolve()
      expect(reload).not.toHaveBeenCalled()

      finish()
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))

      // La página recargada falla otra vez: el error sigue su curso (no hay bucle de recargas).
      await expect(failing()).rejects.toThrow('Failed to fetch')
      expect(reload).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('si carga bien, borra la marca y devuelve la pantalla', async () => {
      sessionStorage.setItem('ygo-lab:chunk-reload', '1')

      await expect(orReload(async () => 'pantalla')()).resolves.toBe('pantalla')
      expect(sessionStorage.getItem('ygo-lab:chunk-reload')).toBeNull()
      expect(reload).not.toHaveBeenCalled()
    })
  })
})
