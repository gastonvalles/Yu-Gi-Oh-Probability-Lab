// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): los interruptores de «Reglas del análisis» del Lab (TI-131, PR 775), en celular y escritorio.
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador, el deck y las reglas se siembran en el `localStorage` de la prueba y
// lo único que se escribe es lo que la app guarda ahí al tocar un interruptor. El catálogo de YGOPRODeck se responde vacío y las imágenes de cartas se cortan.
// Cada caso afirma un criterio de aceptación de TI-131: un interruptor por fila y sin candados; apagar saca la regla de la cuenta y se guarda; «gris» sólo es
// «apagada» (una regla que no cuenta en el turno que se mira conserva su contraste y lo dice); con todo apagado la lista sigue ahí; los interruptores van en una
// columna y su área de toque mide ≥ 44 px.
import { expect, test, type Locator, type Page } from '@playwright/test'

const VANILLAS: [number, string, string][] = [
  [43096270, 'Alexandrite Dragon', 'Dragon'],
  [69247929, 'Gene-Warped Warwolf', 'Beast-Warrior'],
  [11091375, 'Luster Dragon', 'Dragon'],
  [15025844, 'Mystical Elf', 'Spellcaster'],
  [91152256, 'Celtic Guardian', 'Warrior'],
  [5053103, 'Battle Ox', 'Beast-Warrior'],
  [13039848, 'Giant Soldier of Stone', 'Rock'],
  [97590747, 'La Jinn the Mystical Genie of the Lamp', 'Fiend'],
  [14898066, 'Vorse Raider', 'Beast-Warrior'],
  [11321183, 'Dark Blade', 'Warrior'],
  [40374923, 'Mammoth Graveyard', 'Dinosaur'],
  [69140098, 'Gemini Elf', 'Spellcaster'],
  [1184620, 'Kojikocy', 'Warrior'],
]

// Con roles (9 normales «starter», 4 «extender», una Mágica «boardbreaker» y una Trampa «disruption»), como `scripts/pwa-capturas.mjs`.
const card = (id: number, name: string, roles: string[], extra: Record<string, unknown>) => ({
  name,
  apiCard: { ygoprodeckId: id, description: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, linkValue: null, ...extra },
  origin: 'engine',
  roles,
  needsReview: false,
})

const main = [
  ...VANILLAS.flatMap(([id, name, race], index) =>
    Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () => card(id, name, [index < 9 ? 'starter' : 'extender'], { cardType: 'Normal Monster', frameType: 'normal', race, attribute: 'EARTH', level: 4, atk: '1800', def: '1000' })),
  ),
  card(53129443, 'Dark Hole', ['boardbreaker'], { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  card(44095762, 'Mirror Force', ['disruption'], { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
]

// Dos reglas propias: un problema (una Trampa en la mano) y una salida «Sólo 1º» (la Mágica de rompe campo), con nombres que no existen en el catálogo.
const PROBLEM = 'Problema QA'
const FIRST_ONLY = 'Salida QA solo 1º'
const own = (name: string, kind: 'opening' | 'problem', turnContext: 'either' | 'first', role: string) => ({
  name,
  kind,
  turnContext,
  logic: 'all',
  minimumConditionMatches: 1,
  reusePolicy: 'allow',
  needsReview: false,
  conditions: [{ matcher: { type: 'role', value: role }, quantity: 1, kind: 'include', distinct: false }],
})

const STORAGE_KEY = 'ygo-probability-lab:v2'
const deckState = JSON.stringify({
  version: 16,
  handSize: 5,
  deckFormat: 'unlimited',
  patternsSeeded: true,
  patternsSeedVersion: 11,
  disabledGenericRuleIds: [],
  systemRuleNames: {},
  deckBuilder: { deckName: 'Deck QA', main, extra: [], side: [] },
  patterns: [own(PROBLEM, 'problem', 'either', 'disruption'), own(FIRST_ONLY, 'opening', 'first', 'boardbreaker')],
})

test.beforeEach(async ({ context }) => {
  await context.route('https://db.ygoprodeck.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }))
  await context.route('https://images.ygoprodeck.com/**', (route) => route.abort())
  await context.route('**/api/card-image/**', (route) => route.abort())
  await context.addInitScript(
    ({ deck, key }) => {
      // Sólo la primera vez: recargar no pisa lo que la app guardó (las reglas apagadas).
      if (localStorage.getItem(key)) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      localStorage.setItem(key, deck)
    },
    { deck: deckState, key: STORAGE_KEY },
  )
})

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anySwitch = (page: Page) => page.getByRole('switch', { name: /^(Apagar|Prender) la regla / })
const ruleSwitch = (page: Page, name: string) => page.getByRole('switch', { name: new RegExp(`^(Apagar|Prender) la regla ${escape(name)}$`) })
const ruleRow = (page: Page, name: string) => page.locator('li').filter({ has: ruleSwitch(page, name) })
const rowButton = (page: Page, name: string) => ruleRow(page, name).getByRole('button', { name: new RegExp(`^(Editar|Renombrar) regla ${escape(name)}:`) })
const scoreRing = (page: Page) => page.locator('#probability-lab').getByRole('img', { name: /^Manos buenas: / })

/** En el celular «Reglas del análisis» arranca plegada (y vuelve a plegarse si la lista se remonta): se abre si hace falta. */
async function openRules(page: Page) {
  const fold = page.getByRole('button', { name: /^Reglas del análisis/, expanded: false })
  if (await fold.count()) await fold.click()
  await expect(anySwitch(page).first()).toBeVisible()
}

/** El Lab con el resultado a la vista y la lista de reglas abierta. */
async function openLab(page: Page) {
  await page.goto('/#probability-lab')
  await expect(scoreRing(page)).toBeVisible()
  await openRules(page)
}

const opacity = (locator: Locator) => locator.evaluate((el) => Number(getComputedStyle(el).opacity))
const goodLabel = (page: Page) => scoreRing(page).getAttribute('aria-label')
const goodShare = async (page: Page) => Number(((await goodLabel(page)) ?? '').match(/^Manos buenas: ([\d.,]+)/)?.[1]?.replace(',', '.'))

/** Lo que la app guardó en el navegador de la prueba. */
const saved = (page: Page) =>
  page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as { patterns?: { name: string; enabled?: boolean }[]; disabledGenericRuleIds?: string[] }
    return { disabled: state.disabledGenericRuleIds ?? [], offOwn: (state.patterns ?? []).filter((pattern) => pattern.enabled === false).map((pattern) => pattern.name) }
  }, STORAGE_KEY)

test('un interruptor por fila, con su nombre, y ningún candado', async ({ page }) => {
  await openLab(page)
  const switches = anySwitch(page)
  const rows = page.getByRole('button', { name: /^(Editar|Renombrar) regla / })
  const total = await switches.count()
  // Universales + genéricas + las dos propias: más de las dos propias, y exactamente una por fila.
  expect(total).toBeGreaterThan(2)
  await expect(rows).toHaveCount(total)
  await expect(page.getByRole('switch')).toHaveCount(total)
  for (const name of ['Salida básica', PROBLEM, FIRST_ONLY]) await expect(ruleSwitch(page, name), `interruptor de «${name}»`).toHaveCount(1)
  // Todos prendidos y usables (con las reglas sembradas, sin las apagadas).
  for (const state of await switches.evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute('aria-checked')}|${(node as HTMLButtonElement).disabled}`))) expect(state).toBe('true|false')

  // Nada de «bloqueada» ni candado en la lista: ni en el texto ni en los títulos ni en los nombres accesibles.
  const traces = await page.locator('section[aria-label="Salidas"], section[aria-label="Problemas"]').evaluateAll((sections) =>
    sections.flatMap((section) => [section.textContent ?? '', ...[...section.querySelectorAll('[title], [aria-label]')].map((node) => `${node.getAttribute('title') ?? ''} ${node.getAttribute('aria-label') ?? ''}`)]),
  )
  expect(traces.join('\n')).not.toMatch(/bloquead|candado|lock/i)
})

test('apagar la regla propia la saca de la cuenta, se guarda y sobrevive a recargar; prenderla devuelve la cuenta', async ({ page }) => {
  await openLab(page)
  await page.getByRole('radio', { name: /^Promedio/ }).click()
  const before = await goodLabel(page)
  const beforeShare = await goodShare(page)
  await expect(ruleRow(page, PROBLEM).getByRole('meter', { name: new RegExp(`^${escape(PROBLEM)}: `) })).toBeVisible()
  expect(await opacity(rowButton(page, PROBLEM))).toBe(1)

  await ruleSwitch(page, PROBLEM).click()
  await expect(ruleSwitch(page, PROBLEM)).toHaveAttribute('aria-checked', 'false')
  await expect(ruleSwitch(page, PROBLEM)).toHaveAccessibleName(`Prender la regla ${PROBLEM}`)
  // El anillo pasa a «—», la fila queda atenuada y ya no es un medidor.
  const ring = ruleRow(page, PROBLEM).getByRole('img', { name: `${PROBLEM}: Apagada` })
  await expect(ring).toHaveText('—')
  await expect.poll(() => opacity(rowButton(page, PROBLEM))).toBeLessThan(1)
  // Un problema menos: más manos buenas.
  await expect.poll(() => goodLabel(page)).not.toBe(before)
  expect(await goodShare(page)).toBeGreaterThan(beforeShare)
  await expect.poll(async () => (await saved(page)).offOwn).toEqual([PROBLEM])

  // Recargada, sigue apagada (y la cuenta es la de apagada).
  const off = await goodLabel(page)
  await page.reload()
  await expect(scoreRing(page)).toBeVisible()
  await openRules(page)
  await expect(ruleSwitch(page, PROBLEM)).toHaveAttribute('aria-checked', 'false')
  await expect(ruleRow(page, PROBLEM).getByRole('img', { name: `${PROBLEM}: Apagada` })).toHaveText('—')
  await page.getByRole('radio', { name: /^Promedio/ }).click()
  await expect.poll(() => goodLabel(page)).toBe(off)

  // Prendida otra vez, la cuenta vuelve a la original.
  await ruleSwitch(page, PROBLEM).click()
  await expect(ruleSwitch(page, PROBLEM)).toHaveAccessibleName(`Apagar la regla ${PROBLEM}`)
  await expect(ruleRow(page, PROBLEM).getByRole('meter')).toBeVisible()
  await expect.poll(() => goodLabel(page)).toBe(before)
  await expect.poll(() => opacity(rowButton(page, PROBLEM))).toBe(1)
})

test('apagar una universal («Salida básica») deja su anillo en «—» y prenderla la restaura', async ({ page }) => {
  await openLab(page)
  const name = 'Salida básica'
  await expect(ruleRow(page, name).getByRole('meter')).toBeVisible()
  const before = await goodLabel(page)

  await ruleSwitch(page, name).click()
  await expect(ruleSwitch(page, name)).toHaveAttribute('aria-checked', 'false')
  await expect(ruleRow(page, name).getByRole('img', { name: `${name}: Apagada` })).toHaveText('—')
  await expect.poll(() => opacity(rowButton(page, name))).toBeLessThan(1)
  await expect.poll(async () => (await saved(page)).disabled.length).toBeGreaterThan(0)
  // Sin su salida más amplia, la cuenta baja.
  await expect.poll(() => goodLabel(page)).not.toBe(before)

  await ruleSwitch(page, name).click()
  await expect(ruleSwitch(page, name)).toHaveAttribute('aria-checked', 'true')
  await expect(ruleRow(page, name).getByRole('meter')).toBeVisible()
  await expect.poll(() => opacity(rowButton(page, name))).toBe(1)
  await expect.poll(() => goodLabel(page)).toBe(before)
  await expect.poll(async () => (await saved(page)).disabled).toEqual([])
})

test('«gris» sólo es apagada: yendo 2º una regla «Sólo 1º» no se atenúa y dice «No cuenta yendo 2º»', async ({ page }) => {
  await openLab(page)
  await page.getByRole('radio', { name: /^Yendo 2º/ }).click()
  const row = ruleRow(page, FIRST_ONLY)
  const button = rowButton(page, FIRST_ONLY)
  await expect(row.getByText('Sólo 1º', { exact: true })).toBeVisible()
  await expect(row.getByText('No cuenta yendo 2º', { exact: true })).toBeVisible()
  await expect(button).toHaveAccessibleName(new RegExp(`: No cuenta yendo 2º`))
  // Opacidad completa (ni la fila ni su interruptor atenuados) y el interruptor sigue prendido y usable.
  await expect.poll(() => opacity(button)).toBe(1)
  expect(await opacity(ruleSwitch(page, FIRST_ONLY))).toBe(1)
  await expect(ruleSwitch(page, FIRST_ONLY)).toHaveAttribute('aria-checked', 'true')
  await expect(ruleSwitch(page, FIRST_ONLY)).toBeEnabled()
  await expect(row.getByText('Apagada')).toHaveCount(0)

  // Apagada sí se atenúa (y deja de decir que no cuenta: dice que está apagada).
  await ruleSwitch(page, FIRST_ONLY).click()
  await expect(ruleSwitch(page, FIRST_ONLY)).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => opacity(button)).toBeLessThan(1)
  await expect(row.getByText('No cuenta yendo 2º', { exact: true })).toHaveCount(0)

  // Yendo 1º la misma regla cuenta: sin aviso.
  await ruleSwitch(page, FIRST_ONLY).click()
  await page.getByRole('radio', { name: /^Yendo 1º/ }).click()
  await expect(row.getByText('No cuenta yendo 2º', { exact: true })).toHaveCount(0)
  await expect.poll(() => opacity(button)).toBe(1)
})

test('todo apagado: «nada que medir» y la lista de reglas sigue a la vista para prender una', async ({ page }) => {
  await openLab(page)
  const total = await anySwitch(page).count()
  const turnOff = page.getByRole('switch', { name: /^Apagar la regla / })
  for (let left = total; left > 0; left--) {
    await expect(turnOff).toHaveCount(left)
    await turnOff.first().click()
  }
  await expect(page.getByText('Todavía no hay nada que medir', { exact: true })).toBeVisible()
  await expect(scoreRing(page)).toHaveCount(0)
  // En el celular la lista se vuelve a plegar al cambiar de pantalla: se abre y están todas, apagadas.
  await openRules(page)
  await expect(anySwitch(page)).toHaveCount(total)
  await expect(page.getByRole('switch', { name: /^Prender la regla / })).toHaveCount(total)

  // Una prendida y el Lab vuelve a medir.
  await ruleSwitch(page, 'Salida básica').click()
  await expect(scoreRing(page)).toBeVisible()
  await expect(page.getByText('Todavía no hay nada que medir', { exact: true })).toHaveCount(0)
})

test('los interruptores van en una columna, con un área de toque de ≥ 44 px, sin desborde y sin errores de consola', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.location().url.startsWith(origin)) errors.push(message.text())
  })
  await openLab(page)
  const switches = anySwitch(page)
  const total = await switches.count()

  // La misma columna: por columna «Salidas»/«Problemas» (en el celular, una sola columna: todos juntos), con ±1 px; el «⋯» de las propias no lo corre.
  const columns = await switches.evaluateAll((nodes) => {
    const byColumn = new Map<string, number[]>()
    for (const node of nodes) {
      const key = node.closest('section')?.getAttribute('aria-label') ?? '?'
      byColumn.set(key, [...(byColumn.get(key) ?? []), node.getBoundingClientRect().x])
    }
    return [...byColumn].map(([column, xs]) => ({ column, count: xs.length, spread: Math.max(...xs) - Math.min(...xs) }))
  })
  expect(columns.reduce((sum, { count }) => sum + count, 0)).toBe(total)
  for (const { column, spread } of columns) expect(spread, `x de los interruptores de «${column}»`).toBeLessThanOrEqual(1)
  const viewport = page.viewportSize()!
  if (viewport.width < 768) {
    expect(columns, 'en el celular, una sola columna').toHaveLength(2)
    const xs = await switches.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x))
    expect(Math.max(...xs) - Math.min(...xs), 'x de todos los interruptores').toBeLessThanOrEqual(1)
  }

  // El área de toque: a ±20 px del centro vertical de cada interruptor, el elemento que se toca es el interruptor mismo (su ::before) o algo suyo.
  for (let index = 0; index < total; index++) {
    const item = switches.nth(index)
    const hits = await item.evaluate((node) => {
      // Al centro de la pantalla: al borde, el punto de prueba caería fuera de la ventana o bajo la barra de abajo.
      node.scrollIntoView({ block: 'center' })
      const box = node.getBoundingClientRect()
      const x = box.x + box.width / 2
      return [-20, 20].map((dy) => {
        const hit = document.elementFromPoint(x, box.y + box.height / 2 + dy)
        return hit === node || (hit !== null && node.contains(hit)) ? 'ok' : `${hit?.tagName}.${hit?.className} «${hit?.getAttribute('aria-label') ?? ''}» y=${Math.round(box.y)} h=${Math.round(box.height)} vh=${innerHeight}`
      })
    })
    expect(hits, `área de toque de «${await item.getAttribute('aria-label')}»`).toEqual(['ok', 'ok'])
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
  expect(errors, 'errores de consola o de página propios').toEqual([])
})
