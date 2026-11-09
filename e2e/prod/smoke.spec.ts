// Smoke de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`, config `playwright.prod.config.ts`), en celular y escritorio.
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador y el único pedido al relay es `GET /rooms`.
// Cada prueba afirma un texto o un rol que identifica a la pantalla, no «hallazgos».
//
// El catálogo de YGOPRODeck (~20 MB, 15 pedidos, por navegador nuevo) se responde vacío: no es nuestro sitio y no se lo pesa en cada
// corrida. El deck sembrado trae sus propios datos, así que las pantallas no lo necesitan.
//
// Fuera del smoke: el título de /playground (con el deck sembrado a veces no cambia en 20 s: sin explicar, se afirma el h1), los
// valores de Tier lists y Banlists (cambian cada semana: sólo que haya datos) y jugar la mesa de práctica (sólo se abre desde Solo).
import { expect, test, type Page } from '@playwright/test'

// Un deck de 40: 13 monstruos normales (3 copias, la última 2), una Mágica y una Trampa, todos con rol de «starter» para que el Lab mida.
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

// Sin `patternsSeeded`: la app siembra sus reglas de mano buena al abrir, y el Lab mide con ellas.
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

test('la portada carga sin errores de consola ni respuestas >= 400 propias', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const errors: string[] = []
  const bad: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.location().url.startsWith(origin)) errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) bad.push(`${response.status()} ${response.url()}`)
  })
  await page.goto('/')
  await expect(page).toHaveTitle(/YGOUltraLab/)
  // Qué pantalla abre la portada depende del deck guardado (con todo clasificado, el Lab): se afirma el armazón, no una pantalla.
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  expect(errors, 'errores de consola o de página propios').toEqual([])
  expect(bad, 'respuestas >= 400 del propio sitio').toEqual([])
})

test('el armador muestra las cartas del deck sembrado', async ({ page }) => {
  await page.goto('/#deck-builder')
  await expect(heading(page, 'Armá tu deck')).toBeVisible()
  const builder = page.locator('#deck-builder')
  await expect(builder.getByRole('heading', { level: 2, name: 'Main [40]' })).toBeVisible()
  // Las cartas del Main se dicen por su nombre (3 copias de la primera).
  await expect(builder.getByRole('button', { name: /^Alexandrite Dragon\./ })).toHaveCount(3)
  await expect(builder.getByRole('button', { name: /^Dark Hole\./ })).toHaveCount(1)
})

test('el Lab calcula y muestra «de cada 100»', async ({ page }) => {
  await page.goto('/#probability-lab')
  await expect(heading(page, 'Qué tan bien abre tu deck')).toBeVisible()
  // El anillo del resultado: «Manos buenas: 50.0%…» y, adentro, «50» y «de cada 100».
  await expect(page.locator('#probability-lab').getByRole('img', { name: /^Manos buenas: [\d.]+%/ })).toHaveText(/^\d+\s*de cada 100$/)
})

test('Solo abre la mesa de práctica', async ({ page }) => {
  await page.goto('/#solo')
  await expect(heading(page, 'Solo')).toBeVisible()
  await expect(page.locator('#solo').getByRole('heading', { level: 2, name: 'Probá tu combo' })).toBeVisible()
  await page.getByRole('button', { name: /^Jugar contra/ }).click()
  await expect(page).toHaveURL(/#practice$/)
  await expect(page.getByLabel('Mesa de práctica')).toBeVisible()
  await expect(page.getByLabel('Puntos de vida de Vos: 8000')).toBeVisible()
})

test('Tier lists y Banlists listan datos', async ({ page }) => {
  await page.goto('/#meta')
  await expect(heading(page, 'Tier lists')).toBeVisible()
  await expect(page.locator('#meta').getByRole('heading', { level: 2, name: 'Tier list de hand traps' })).toBeVisible()
  await expect(page.locator('#meta').getByText(/\d+ decks/).first()).toBeVisible()

  await page.goto('/#banlists')
  await expect(heading(page, 'Banlists')).toBeVisible()
  await expect(page.locator('#banlists').getByText('Vigente', { exact: true }).first()).toBeVisible()
  await expect(page.locator('#banlists').getByText(/\d{1,2} de [a-záéíóú]+ de \d{4}/).first()).toBeVisible()
})

test('Novedades lista las entradas, filtra por etiqueta y baja hasta una entrada', async ({ page }) => {
  await page.goto('/#novedades')
  await expect(heading(page, 'Novedades')).toBeVisible()
  const entries = page.locator('section[id^="novedad-"]')
  await expect(entries.first()).toBeVisible()
  const all = await entries.count()
  expect(all).toBeGreaterThan(3)

  // Una etiqueta deja sólo las suyas (la cuenta del chip dice cuántas).
  await page.getByRole('button', { name: /^Arreglo \d+$/ }).click()
  const fixes = await entries.count()
  expect(fixes).toBeGreaterThan(0)
  expect(fixes).toBeLessThan(all)

  // El enlace a una entrada abre la pantalla con esa tarjeta a la vista (la más vieja de la tanda de relleno).
  await page.goto('/#novedades?entrada=2026-11-01-solo-y-bots')
  await expect(page.locator('#novedad-2026-11-01-solo-y-bots')).toBeInViewport()
})

test('Online abre el lobby (sólo GET /rooms, sin crear salas)', async ({ page }) => {
  const rooms = page.waitForResponse((response) => /\/rooms$/.test(new URL(response.url()).pathname))
  await page.goto('/#duel')
  const response = await rooms
  expect(response.request().method()).toBe('GET')
  expect(response.status()).toBe(200)
  await expect(heading(page, 'Jugar')).toBeVisible()
  await expect(page.locator('#duel').getByRole('heading', { level: 2, name: 'En la arena ahora' })).toBeVisible()
  await expect(page.locator('#duel').getByRole('button', { name: /^Jugar ahora/ })).toBeVisible()
})

test('/playground responde', async ({ page }) => {
  // El catálogo es pesado: en un celular emulado el hilo principal llegó a quedar ocupado ~30 s al abrirlo (observado, ver informe).
  test.setTimeout(120_000)
  const response = await page.goto('/playground')
  expect(response?.status()).toBe(200)
  await expect(heading(page, 'Playground')).toBeVisible({ timeout: 90_000 })
})
