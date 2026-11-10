// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): el modo sin conexión (TI-132 service worker, TI-133 aviso y pantallas), en celular y escritorio.
// Es el ÚNICO caso con el service worker puesto (`serviceWorkers: 'allow'`): el resto del smoke corre con él bloqueado (`playwright.prod.config.ts`).
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador, el deck se siembra en el `localStorage` de la prueba y lo único que se
// pide a la red es lo estático del sitio. El catálogo de YGOPRODeck se responde vacío.
// Cada caso afirma un criterio de aceptación: con la app cargada una vez y sin señal, «Inicio», el armador con deck, el Lab y `#life` abren desde el service worker y sin
// errores propios; el aviso «Sin conexión» aparece y se va con la señal; Online y Solo explican en vez de quedar en blanco; los cachés son los del service worker y
// no pisan los de la app.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

const VANILLAS: [number, string][] = [
  [43096270, 'Alexandrite Dragon'],
  [69247929, 'Gene-Warped Warwolf'],
  [11091375, 'Luster Dragon'],
  [15025844, 'Mystical Elf'],
  [91152256, 'Celtic Guardian'],
  [5053103, 'Battle Ox'],
  [13039848, 'Giant Soldier of Stone'],
  [97590747, 'La Jinn the Mystical Genie of the Lamp'],
  [14898066, 'Vorse Raider'],
  [11321183, 'Dark Blade'],
  [40374923, 'Mammoth Graveyard'],
  [69140098, 'Gemini Elf'],
  [1184620, 'Kojikocy'],
]

const card = (id: number, name: string, extra: Record<string, unknown>) => ({
  name,
  apiCard: { ygoprodeckId: id, description: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, linkValue: null, ...extra },
  origin: 'engine',
  roles: ['starter'],
  needsReview: false,
})

const main = [
  ...VANILLAS.flatMap(([id, name], index) => Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () => card(id, name, { cardType: 'Normal Monster', frameType: 'normal', race: 'Warrior', attribute: 'EARTH', level: 4, atk: '1500', def: '1000' }))),
  card(53129443, 'Dark Hole', { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  card(44095762, 'Mirror Force', { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
]

const deckState = JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: false, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: 'Deck QA', main, extra: [], side: [] }, patterns: [] })

test.beforeEach(async ({ context }) => {
  await context.route('https://db.ygoprodeck.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }))
  await context.addInitScript(
    ({ deck }) => {
      // Sólo la primera vez: recargar no pisa lo que la app guardó.
      if (localStorage.getItem('ygo-probability-lab:v2')) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      localStorage.setItem('ygo-probability-lab:v2', deck)
    },
    { deck: deckState },
  )
})

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const notice = (page: Page) => page.getByRole('status').filter({ hasText: 'Sin conexión' })

// Lo único que puede fallar de red sin señal: precios, el meta en vivo, el estado del build, los datos del duelo automático y el catálogo de YGOPRODeck.
const NETWORK_ONLY = /\/prices|\/api\/live|\/build\.json|\/auto-data|db\.ygoprodeck\.com/
const NETWORK_ERROR = /ERR_INTERNET_DISCONNECTED|Failed to load resource/

/**
 * Sin señal. Con un `context.route` activo, Playwright corta los pedidos que contesta el service worker apenas se apaga la red (probado: sin ruta, el mismo `fetch`
 * sale del caché): es de la prueba, no del sitio. Por eso se saca la ruta del catálogo antes de apagarla; sin señal esos pedidos fallan solos y se esperan (`NETWORK_ONLY`).
 */
async function offline(context: BrowserContext) {
  await context.unrouteAll({ behavior: 'wait' })
  await context.setOffline(true)
}

/** Carga `/` una vez con señal y espera al service worker activo, que ya controla la página y que terminó de guardar su versión. */
async function controlled(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  // Un cache de la app que ya existía: el service worker no lo toca. Se crea apenas carga `/`: el registro y la instalación (132 archivos) llegan después.
  await page.evaluate(async () => (await caches.open('ygoprodeck-qa-centinela')).put('/qa', new Response('qa')))
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  // `clients.claim()` lo hace controlar sin recargar; si el navegador no lo alcanzó, una recarga.
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('sin conexión, «Inicio», el armador con deck, el Lab y `#life` abren desde el service worker, sin errores propios', async ({ page, context }) => {
  test.setTimeout(120_000)
  await controlled(page)

  await offline(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (NETWORK_ERROR.test(text) && NETWORK_ONLY.test(`${message.location().url} ${text}`)) return
    errors.push(`consola: ${text} (${message.location().url})`)
  })

  // Cada pantalla se abre con una navegación de verdad (el hash y una recarga), que sólo puede contestar el service worker.
  const open = async (hash: string, title: string) => {
    await page.goto(`/${hash}`)
    const response = await page.reload()
    expect(response?.fromServiceWorker(), `la navegación de ${hash} la contesta el service worker`).toBe(true)
    await expect(heading(page, title), `${hash} muestra «${title}»`).toBeVisible()
  }
  await open('#inicio', '¿Cuántas veces abrís tu carta?')
  await open('#deck-builder', 'Armá tu deck')
  await expect(page.locator('#deck-builder').getByRole('heading', { level: 2, name: 'Main [40]' })).toBeVisible()
  await expect(page.locator('#deck-builder').getByRole('button', { name: /^Alexandrite Dragon\./ })).toHaveCount(3)
  await open('#probability-lab', 'Qué tan bien abre tu deck')
  await expect(page.locator('#probability-lab').getByRole('img', { name: /^Manos buenas: [\d.]+%/ })).toHaveText(/^\d+\s*de cada 100$/)
  await open('#life', 'Calculadora de LP')

  // Sin conexión de verdad: `setOffline` alcanzó al service worker, que tampoco puede pedir el estado del build.
  const reached = await page.evaluate(() => fetch('/build.json', { cache: 'no-store' }).then(() => true, () => false))
  expect(reached, 'fetch(/build.json) falla sin conexión').toBe(false)
  expect(errors, 'errores de página o de consola que no son de red').toEqual([])
})

test('el aviso «Sin conexión» aparece al perder la señal (sin recargar) y se va al volver', async ({ page, context }) => {
  test.setTimeout(120_000)
  await controlled(page)
  await expect(notice(page)).toHaveCount(0)

  await offline(context)
  await expect(notice(page).first()).toBeVisible()
  await expect(notice(page).first()).toContainText('Tu deck, el Lab y la calculadora siguen andando')

  await context.setOffline(false)
  await expect(notice(page)).toHaveCount(0)
})

test('sin conexión, Online explica y ofrece «Jugar solo»; Solo no tira la app', async ({ page, context }) => {
  test.setTimeout(120_000)
  await controlled(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

  await offline(context)
  await page.goto('/#duel')
  await expect(page.getByText('Online necesita señal', { exact: true })).toBeVisible()
  await expect(page.locator('#duel').getByRole('button', { name: 'Jugar solo' })).toBeVisible()
  await expect(page.getByText('Algo salió mal')).toHaveCount(0)

  await page.goto('/#solo')
  await expect(heading(page, 'Solo')).toBeVisible()
  await expect(page.locator('#solo').getByRole('heading', { level: 2, name: 'Probá tu combo' })).toBeVisible()
  await expect(page.getByText('Algo salió mal')).toHaveCount(0)
  expect(errors, 'errores de página').toEqual([])
})

test('los cachés: uno `ygoul-sw-<versión>` del service worker y los de la app intactos', async ({ page }) => {
  test.setTimeout(120_000)
  await controlled(page)
  const keys = await page.evaluate(() => caches.keys())
  expect(keys.filter((key) => /^ygoul-sw-.+/.test(key)), 'cachés del service worker').not.toHaveLength(0)
  expect(keys, 'el caché de la app que ya estaba sigue ahí').toContain('ygoprodeck-qa-centinela')
  // Todo lo demás es de la app (`ygoprodeck-*`, `auto-data-*`) o del service worker: nada con otro prefijo.
  expect(keys.filter((key) => !/^(ygoul-sw-|ygoprodeck-|auto-data-)/.test(key)), 'cachés con un prefijo ajeno').toEqual([])
})
