// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): «Inicio» como entrada, «Seguir con tu deck», la tarjeta de instalar y el manifest.
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador y lo demás son GET de archivos estáticos.
// Cada caso afirma un criterio de aceptación de las cards TI-121 (manifest), TI-122 («Inicio» y «Seguir con tu deck») y TI-123 (instalar).
//
// Cada caso arma su propio contexto: «Inicio» sólo llega sola en una sesión nueva (sin la marca de sesión `ygo-lab:entered`) y la tarjeta de instalar depende del
// navegador (User-Agent, puntero táctil, `display-mode`). Los de «Inicio» y los accesos directos corren en los dos viewports; los de instalar y el manifest, una vez
// (se saltean en el proyecto `mobile`), porque fijan su propio navegador. No se pesa el catálogo de YGOPRODeck: se responde vacío.
import { devices, expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'

const SUFFIX = 'YGOUltraLab-QA'
const LANDING_TITLE = '¿Cuántas veces abrís tu carta?'
const RESUME = 'Seguir con tu deck'
const INSTALL_TITLE = 'Instalá YGOUltraLab'
const ANDROID_STEPS = 'Tocá ⋮ y elegí «Instalar app».'
const IOS_STEPS = 'Tocá «Compartir» y elegí «Añadir a pantalla de inicio».'

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

/** Un deck de 40 cartas (13 normales, una Mágica y una Trampa); `roles` vacío = sin clasificar. */
function deckJson(name: string, roles: string[]): string {
  const card = (id: number, cardName: string, extra: Record<string, unknown>) => ({
    name: cardName,
    apiCard: { ygoprodeckId: id, description: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, linkValue: null, ...extra },
    origin: 'engine',
    roles,
    needsReview: false,
  })
  const main = [
    ...VANILLAS.flatMap(([id, n], index) => Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () => card(id, n, { cardType: 'Normal Monster', frameType: 'normal', race: 'Warrior', attribute: 'EARTH', level: 4, atk: '1500', def: '1000' }))),
    card(53129443, 'Dark Hole', { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
    card(44095762, 'Mirror Force', { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  ]

  return JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: false, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: name, main, extra: [], side: [] }, patterns: [] })
}

const CLASSIFIED = deckJson('Deck QA', ['starter'])
const UNCLASSIFIED = deckJson('Deck sin roles QA', [])

interface Fresh {
  deck?: string
  /** `addInitScript` extra (se evalúa antes que la app). */
  init?: () => void
  context?: BrowserContextOptions
}

/** Una sesión nueva: contexto limpio (sin marca de sesión), con o sin el deck guardado. Hereda User-Agent, viewport y toque del proyecto salvo que `context` los pise. */
async function fresh(browser: Browser, baseURL: string, project: { use: Record<string, unknown> }, { deck, init, context: overrides }: Fresh = {}): Promise<BrowserContext> {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = project.use as Pick<BrowserContextOptions, 'userAgent' | 'viewport' | 'deviceScaleFactor' | 'isMobile' | 'hasTouch'>
  const context = await browser.newContext({ baseURL, locale: 'es-AR', userAgent, viewport, deviceScaleFactor, isMobile, hasTouch, serviceWorkers: 'block', ...overrides })
  await context.route('https://db.ygoprodeck.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }))
  await context.addInitScript(
    ({ saved }) => {
      // Sólo la primera vez: recargar no pisa lo que la app o la prueba guardaron.
      if (localStorage.getItem('ygo-lab:locale')) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      if (saved) localStorage.setItem('ygo-probability-lab:v2', saved)
    },
    { saved: deck ?? null },
  )
  if (init) await context.addInitScript(init)

  return context
}

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const installTitle = (page: Page) => page.getByText(INSTALL_TITLE, { exact: true })

// Los navegadores de celular de la prueba de instalar: 390×844, con toque, como el proyecto `mobile`.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } as const
const androidContext = { ...PHONE, userAgent: `${devices['Pixel 7'].userAgent} ${SUFFIX}` }
const iphoneContext = { ...PHONE, userAgent: `${devices['iPhone 14'].userAgent} ${SUFFIX}` }

/** El `display-mode: standalone` de la app instalada. */
const standalone = () => {
  const original = window.matchMedia.bind(window)
  window.matchMedia = (query: string) =>
    query.includes('display-mode: standalone')
      ? ({ matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
      : original(query)
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Manifest (TI-121): el archivo, sus íconos y capturas, y el enlace desde `/`.

interface ManifestImage { src: string; sizes?: string; type?: string; purpose?: string; form_factor?: string }
interface Manifest { id?: string; categories?: string[]; icons?: ManifestImage[]; screenshots?: ManifestImage[]; shortcuts?: { name: string; url: string }[] }

test.describe('manifest', () => {
  test.skip(({ isMobile }) => isMobile, 'no depende del viewport: una vez')

  test('GET /site.webmanifest: id, íconos any y maskable de 192 y 512, categories, 4 shortcuts y capturas; cada imagen responde con su tipo', async ({ request }, testInfo) => {
    const headers = { 'user-agent': testInfo.project.use.userAgent as string }
    const response = await request.get('/site.webmanifest', { headers })
    expect(response.status()).toBe(200)
    const manifest = (await response.json()) as Manifest

    expect(manifest.id).toBe('/')
    const has = (purpose: string, size: string) => manifest.icons?.some((icon) => icon.sizes === size && (icon.purpose ?? 'any').split(' ').includes(purpose))
    for (const purpose of ['any', 'maskable']) for (const size of ['192x192', '512x512']) expect(has(purpose, size), `ícono ${purpose} ${size}`).toBe(true)
    expect(manifest.categories?.length ?? 0).toBeGreaterThan(0)
    expect(manifest.shortcuts).toHaveLength(4)
    expect(manifest.screenshots?.length ?? 0).toBeGreaterThanOrEqual(1)

    // Cada archivo una vez (los íconos `any` y `maskable` pueden compartir `src`).
    const images = new Map<string, string | undefined>()
    for (const image of [...(manifest.icons ?? []), ...(manifest.screenshots ?? [])]) images.set(image.src, image.type)
    for (const [src, type] of images) {
      const image = await request.get(src, { headers })
      expect(image.status(), `GET ${src}`).toBe(200)
      expect(image.headers()['content-type'], `tipo de ${src}`).toContain(type ?? 'image/')
    }
  })

  test('`/` enlaza /site.webmanifest', async ({ request }, testInfo) => {
    const html = await (await request.get('/', { headers: { 'user-agent': testInfo.project.use.userAgent as string } })).text()
    const link = html.match(/<link[^>]*rel=["']manifest["'][^>]*>/)?.[0] ?? ''
    expect(link).toMatch(/href=["']\/site\.webmanifest["']/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Accesos directos del manifest: cada `shortcuts[i].url` abre su pantalla en una sesión nueva.

const SHORTCUTS: [string, string][] = [
  ['/#deck-builder', 'Armá tu deck'],
  ['/#probability-lab', 'Qué tan bien abre tu deck'],
  ['/#solo', 'Solo'],
  ['/#life', 'Calculadora de LP'],
]

test('los accesos directos del manifest abren su pantalla, sin errores de consola ni respuestas >= 400 propias', async ({ browser, baseURL, request }, testInfo) => {
  const manifest = (await (await request.get('/site.webmanifest', { headers: { 'user-agent': testInfo.project.use.userAgent as string } })).json()) as Manifest
  expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(SHORTCUTS.map(([url]) => url))

  const origin = new URL(baseURL!).origin
  for (const [url, title] of SHORTCUTS) {
    const context = await fresh(browser, baseURL!, testInfo.project, { deck: CLASSIFIED })
    const page = await context.newPage()
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`pageerror ${url}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' && message.location().url.startsWith(origin)) problems.push(`consola ${url}: ${message.text()}`)
    })
    page.on('response', (response) => {
      if (response.url().startsWith(origin) && response.status() >= 400) problems.push(`${response.status()} ${response.url()}`)
    })
    await page.goto(url)
    await expect(heading(page, title), `${url} muestra «${title}»`).toBeAttached()
    await expect(heading(page, LANDING_TITLE), `${url} no abre «Inicio»`).toHaveCount(0)
    expect(problems, `errores en ${url}`).toEqual([])
    await context.close()
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// «Inicio» como entrada y «Seguir con tu deck» (TI-122).

test('«Inicio» sin deck: una sesión nueva en `/` abre «Inicio» y no ofrece «Seguir con tu deck»', async ({ browser, baseURL }, testInfo) => {
  const context = await fresh(browser, baseURL!, testInfo.project)
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/#inicio$/)
  await expect(heading(page, LANDING_TITLE)).toBeVisible()
  await expect(page.getByText(RESUME, { exact: true })).toHaveCount(0)
  await context.close()
})

test('«Inicio» con un deck de 40: «Seguir con tu deck» con su nombre y su cuenta; un deck clasificado lleva al Lab, nunca a Exportar', async ({ browser, baseURL }, testInfo) => {
  const context = await fresh(browser, baseURL!, testInfo.project, { deck: CLASSIFIED })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/#inicio$/)
  await expect(heading(page, LANDING_TITLE)).toBeVisible()
  const card = page.getByRole('region', { name: 'Deck QA' })
  await expect(card).toBeVisible()
  // La cuenta «40 + 0 + 0» se dice para el lector de pantalla como «Main 40, Extra 0 y Side 0».
  await expect(card.getByText('Main 40, Extra 0 y Side 0')).toBeAttached()
  await card.getByRole('button', { name: RESUME }).click()
  await expect(page).toHaveURL(/#probability-lab$/)
  await expect(heading(page, 'Qué tan bien abre tu deck')).toBeVisible()
  expect(page.url()).not.toContain('#export')
  await context.close()
})

test('«Inicio» con un deck de 40 sin clasificar: el botón lleva a clasificar, nunca a Exportar', async ({ browser, baseURL }, testInfo) => {
  const context = await fresh(browser, baseURL!, testInfo.project, { deck: UNCLASSIFIED })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/#inicio$/)
  await page.getByRole('region', { name: 'Deck sin roles QA' }).getByRole('button', { name: RESUME }).click()
  await expect(page).toHaveURL(/#categorization$/)
  expect(page.url()).not.toContain('#export')
  await context.close()
})

test('misma sesión: tras entrar a un paso, `/` no vuelve a «Inicio»; un hash con destino abre lo suyo', async ({ browser, baseURL }, testInfo) => {
  const context = await fresh(browser, baseURL!, testInfo.project, { deck: CLASSIFIED })
  const page = await context.newPage()
  await page.goto('/')
  await expect(heading(page, LANDING_TITLE)).toBeVisible()
  await page.getByRole('button', { name: RESUME }).click()
  await expect(heading(page, 'Qué tan bien abre tu deck')).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(heading(page, LANDING_TITLE)).toHaveCount(0)
  expect(page.url()).not.toContain('#inicio')
  await context.close()

  // Una sesión nueva con un destino en el hash abre ese destino, no «Inicio».
  const other = await fresh(browser, baseURL!, testInfo.project, { deck: CLASSIFIED })
  const tab = await other.newPage()
  await tab.goto('/#meta')
  await expect(heading(tab, 'Tier lists')).toBeVisible()
  await expect(heading(tab, LANDING_TITLE)).toHaveCount(0)
  await other.close()
})

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// La tarjeta «Instalá YGOUltraLab» (TI-123).

test.describe('instalar', () => {
  test.skip(({ isMobile }) => isMobile, 'fija su propio navegador: una vez')

  test('Android: los pasos; «Ahora no» la esconde y recargar no la devuelve; con la fecha 31 días atrás, vuelve', async ({ browser, baseURL }, testInfo) => {
    const context = await fresh(browser, baseURL!, testInfo.project, { context: androidContext })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/#inicio$/)
    await expect(installTitle(page)).toBeVisible()
    await expect(page.getByText(ANDROID_STEPS)).toBeVisible()
    await expect(page.getByText(IOS_STEPS)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Instalar la app' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ahora no' }).click()
    await expect(installTitle(page)).toHaveCount(0)
    await page.reload()
    await expect(heading(page, LANDING_TITLE)).toBeVisible()
    await expect(installTitle(page)).toHaveCount(0)

    await page.evaluate(() => localStorage.setItem('ygo-lab:install-hidden', new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()))
    await page.reload()
    await expect(installTitle(page)).toBeVisible()
    await context.close()
  })

  test('iPhone: los pasos de iOS', async ({ browser, baseURL }, testInfo) => {
    const context = await fresh(browser, baseURL!, testInfo.project, { context: iphoneContext })
    const page = await context.newPage()
    await page.goto('/')
    await expect(installTitle(page)).toBeVisible()
    await expect(page.getByText(IOS_STEPS)).toBeVisible()
    await expect(page.getByText(ANDROID_STEPS)).toHaveCount(0)
    await context.close()
  })

  test('escritorio (1440×900, mouse): sin tarjeta', async ({ browser, baseURL }, testInfo) => {
    const context = await fresh(browser, baseURL!, testInfo.project, { context: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, userAgent: `${devices['Desktop Chrome'].userAgent} ${SUFFIX}` } })
    const page = await context.newPage()
    await page.goto('/')
    await expect(heading(page, LANDING_TITLE)).toBeVisible()
    await expect(installTitle(page)).toHaveCount(0)
    await context.close()
  })

  test('app instalada (display-mode: standalone) en el celular: sin tarjeta', async ({ browser, baseURL }, testInfo) => {
    const context = await fresh(browser, baseURL!, testInfo.project, { context: androidContext, init: standalone })
    const page = await context.newPage()
    await page.goto('/')
    await expect(heading(page, LANDING_TITLE)).toBeVisible()
    await expect(installTitle(page)).toHaveCount(0)
    await context.close()
  })

  test('con un `beforeinstallprompt` simulado aparece «Instalar la app» y abre el aviso', async ({ browser, baseURL }, testInfo) => {
    const context = await fresh(browser, baseURL!, testInfo.project, { context: androidContext })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByText(ANDROID_STEPS)).toBeVisible()
    await page.evaluate(() => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          ;(window as unknown as { __prompted: boolean }).__prompted = true
        },
        userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
      })
      window.dispatchEvent(event)
    })
    const button = page.getByRole('button', { name: 'Instalar la app' })
    await expect(button).toBeVisible()
    await expect(page.getByText(ANDROID_STEPS)).toHaveCount(0)
    await button.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted === true)).toBe(true)
    await context.close()
  })
})
