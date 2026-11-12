// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): el duelo rearmado (TI-138: campo de siete columnas, fondo remolino, esquinas rectas, chapas y línea, menús) y «Las 7» (TI-171 a TI-179), en celular y escritorio.
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador y el deck se siembra en el `localStorage` de la prueba. El catálogo de YGOPRODeck se responde vacío y las imágenes de cartas se cortan.
// Dos grupos: la práctica MANUAL (`ygo-lab:auto-duel` en «off»: «Solo» → «Jugar contra las handtraps» abre la mesa sin núcleo ni relay) y el duelo AUTOMÁTICO (necesita `/auto-data/*` y el núcleo: el sitio publicado o un dev server,
// p. ej. `BASE_URL=http://ti180.localhost:5281`; contra `127.0.0.1`/`localhost` se saltea).
// Cada caso afirma un criterio de aceptación de TI-140 a TI-148 y TI-171 a TI-179: 7 pistas y sin scroll horizontal, el campo y tu mano quietos (`y` idéntica) al abrir una carta, el Cementerio o las fases, ningún `border-radius` distinto de 0,
// un solo AVIF de fondo por ancho, el menú manual intacto (con «Al deck ›» y su ficha de fase), y en el automático: la pista de fases en la línea (nunca vacía; ningún «Fases:» dentro del campo), el botón del turno al alcance del pulgar,
// las hojas opacas, «‹ GY» que vuelve al visor, el ATK al pie de la carta sin Nivel a la vista y, en escritorio, el menú de 76 px, la casilla de ≥ 88 px y la columna «Carta · Cadena · Pasos».
//
// Lo que se afirma en la práctica manual y no en el duelo: las chapas («Vos» y «Rival») y la línea (`data-duel-line`) sólo existen en un duelo (automático o por enlace); la práctica manual no tiene vidas.
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

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

const stateOf = (cards: unknown[]) => JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: false, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: 'Deck QA', main: cards, extra: [], side: [] }, patterns: [] })
const deckState = stateOf(main)

// Dos decks de 40 cartas iguales: la mano es siempre la misma carta, así que el caso no depende de la suerte del reparto. Gene-Warped Warwolf (monstruo normal de 2000 de ATK) para invocar; Ookazi (Mágica
// normal que se activa sin pedir nada y termina en el Cementerio) para abrir el Cementerio con una carta adentro.
const SPELL = { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }
const warwolfDeck = stateOf(Array.from({ length: 40 }, () => card(69247929, 'Gene-Warped Warwolf', { cardType: 'Normal Monster', frameType: 'normal', race: 'Beast-Warrior', attribute: 'EARTH', level: 4, atk: '2000', def: '100' })))
const ookaziDeck = stateOf(Array.from({ length: 40 }, () => card(19523799, 'Ookazi', SPELL)))

/** Aislamiento: deck sembrado, sin mascotas ni sonidos, catálogo vacío y sin imágenes de cartas. `auto` deja el modo del duelo en su valor de fábrica (automático) o lo apaga (la mesa manual). */
async function prepare(context: BrowserContext, auto: boolean, deck: string = deckState) {
  await context.route('https://db.ygoprodeck.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }))
  await context.route('https://images.ygoprodeck.com/**', (route) => route.abort())
  await context.route('**/api/card-image/**', (route) => route.abort())
  await context.addInitScript(
    ({ deck, manual }) => {
      // Sólo la primera vez: recargar no pisa lo que la app guardó.
      if (localStorage.getItem('ygo-probability-lab:v2')) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      if (manual) localStorage.setItem('ygo-lab:auto-duel', 'off')
      localStorage.setItem('ygo-probability-lab:v2', deck)
    },
    { deck, manual: !auto },
  )
}

const mat = (page: Page) => page.getByLabel('Mesa de práctica')
const handList = (page: Page) => page.getByRole('list', { name: 'Mano' })

/** «Solo» → «Jugar contra las handtraps» (con el modo automático apagado es la mesa manual: sin núcleo ni relay), con la mano repartida. */
async function openMat(page: Page) {
  await page.goto('/#solo')
  await page.getByRole('button', { name: /^Jugar contra/ }).click()
  await expect(page).toHaveURL(/#practice$/)
  await expect(mat(page)).toBeVisible()
  await expect(handList(page).getByRole('listitem')).toHaveCount(5)
}

/** Un monstruo de la mano (la mano es al azar: una Mágica no tiene «Invocación Normal»), con su nombre. */
async function monsterOf(page: Page) {
  const names = await handList(page).getByRole('listitem').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
  const name = names.find((label) => !/^(Dark Hole|Mirror Force)$/.test(label))!
  return { name, item: handList(page).getByRole('listitem', { name, exact: true }).first() }
}

/** El campo: la grilla de siete pistas que contiene el deck. */
const FIELD = `(() => {
  let node = document.querySelector('[data-drop="deck"]')
  while (node && !(getComputedStyle(node).display === 'grid' && getComputedStyle(node).gridTemplateColumns.split(' ').length >= 7)) node = node.parentElement
  return node
})()`

const fieldTracks = (page: Page) =>
  page.evaluate(`(() => {
    const field = ${FIELD}
    const style = getComputedStyle(field)
    const box = field.getBoundingClientRect()
    const tracks = style.gridTemplateColumns.split(' ').map(parseFloat)
    const gap = parseFloat(style.columnGap) || 0
    // La pista de cada centro: se cuenta de izquierda a derecha con el hueco entre pistas.
    const edges = []
    let x = box.left
    for (const width of tracks) { edges.push([x, x + width]); x += width + gap }
    const trackOf = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect()
      const center = rect.left + rect.width / 2
      return edges.findIndex(([from, to]) => center >= from - 1 && center <= to + 1)
    }
    return { tracks, deck: trackOf('[data-drop="deck"]'), extra: trackOf('[data-drop="extra"]') }
  })()`) as Promise<{ tracks: number[]; deck: number; extra: number }>

/** La mesa y, por portal, su hoja, su menú, su visor o su panel: cada raíz `mat-square` y todo lo que lleva adentro. `rounded-full` computa a un valor enorme (3.35544e+07 px): también cuenta. */
const roundCorners = (page: Page) =>
  page.evaluate(() => {
    const roots = new Set<Element>([document.querySelector('[aria-label="Mesa de práctica"]')!, ...document.querySelectorAll('.mat-square, [data-auto-panel], [data-pile-sheet]')])
    const all = new Set<Element>()
    for (const root of roots) for (const node of [root, ...root.querySelectorAll('*')]) all.add(node)
    return [...all].flatMap((node) => {
      const style = getComputedStyle(node)
      const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      return radii.every((radius) => parseFloat(radius) === 0) ? [] : [`${node.tagName.toLowerCase()}[${node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 20)}] y=${Math.round(node.getBoundingClientRect().top)}`]
    })
  })

/** Un muestreador por cuadro: guarda el mínimo y el máximo de la `y` del campo y de tu mano desde que se llama (un salto que vuelve no se escapa). Se lee con `readYs`. */
const watchYs = (page: Page) =>
  page.evaluate(`(() => {
    const field = ${FIELD}
    const hand = document.querySelector('[role=list][aria-label=Mano]')
    const seen = { field: [Infinity, -Infinity], hand: [Infinity, -Infinity] }
    window.__ys = seen
    const sample = () => {
      for (const [key, node] of [['field', field], ['hand', hand]]) { const y = node.getBoundingClientRect().top; seen[key] = [Math.min(seen[key][0], y), Math.max(seen[key][1], y)] }
      window.__raf = requestAnimationFrame(sample)
    }
    sample()
  })()`)

async function readYs(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page.evaluate(() => {
    cancelAnimationFrame((window as unknown as { __raf: number }).__raf)
    return (window as unknown as { __ys: Record<'field' | 'hand', [number, number]> }).__ys
  })
}

function expectStill(seen: Record<'field' | 'hand', [number, number]>, when: string) {
  expect(seen.field[1] - seen.field[0], `${when}: la y del campo varió entre ${seen.field[0]} y ${seen.field[1]}`).toBeLessThanOrEqual(0.5)
  expect(seen.hand[1] - seen.hand[0], `${when}: la y de tu mano varió entre ${seen.hand[0]} y ${seen.hand[1]}`).toBeLessThanOrEqual(0.5)
}

test.describe('práctica manual', () => {
  test.beforeEach(async ({ context }) => prepare(context, false))

  test('el campo tiene siete columnas, Deck y Extra en los extremos, sin scroll horizontal y con casillas de ≥ 52 px a 390 px', async ({ page }) => {
    await openMat(page)
    const { tracks, deck, extra } = await fieldTracks(page)
    expect(tracks, 'pistas de la grilla del campo').toHaveLength(7)
    expect(extra, 'el Extra en la primera columna').toBe(0)
    expect(deck, 'el Deck en la última columna').toBe(6)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
    // Las cinco casillas del medio; en el celular (390 px), al menos 52 px (la de 390 mide ~56).
    if (page.viewportSize()!.width <= 390) for (const width of tracks.slice(1, 6)) expect(width).toBeGreaterThanOrEqual(52)
  })

  test('el campo y tu mano no se mueven al tocar una carta, abrir su hoja o su menú y cerrarlos', async ({ page, isMobile }) => {
    await openMat(page)
    const { item, name } = await monsterOf(page)
    // Antes de tocar: lo que se vea moverse (el reparto) ya terminó.
    await page.evaluate(`new Promise((resolve) => {
      const read = () => { const field = ${FIELD}; const hand = document.querySelector('[role=list][aria-label=Mano]'); return field.getBoundingClientRect().top + '|' + hand.getBoundingClientRect().top }
      let last = read()
      let still = 0
      const tick = () => { const now = read(); still = now === last ? still + 1 : 0; last = now; still >= 5 ? resolve(null) : setTimeout(tick, 100) }
      tick()
    })`)
    // Un muestreador por cuadro durante todo el gesto.
    await watchYs(page)

    if (isMobile) await item.tap()
    else await item.click()
    const sheet = page.getByRole('menu', { name, exact: true })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('menuitem').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    expectStill(await readYs(page), 'al tocar una carta, abrir su hoja y cerrarla')
  })

  test('esquinas rectas: en la mesa (la barra, el ⋯, el panel «Pasos y combos» y sus fichas) y en la hoja o el menú de una carta, ningún `border-radius` distinto de 0', async ({ page, isMobile }) => {
    await openMat(page)
    // Escritorio: el panel lateral está abierto, con las fichas de «Salidas y problemas» abajo.
    if (!isMobile) await expect(page.getByRole('region', { name: 'Pasos y combos' })).toBeVisible()
    expect(await roundCorners(page), 'elementos de la mesa con `border-radius` distinto de 0').toEqual([])

    // El ⋯ abierto (sus interruptores) y, en el celular, el panel de pasos en su diálogo.
    await page.getByRole('button', { name: 'Más opciones' }).first().click()
    await expect(page.getByRole('menuitemcheckbox').first()).toBeVisible()
    expect(await roundCorners(page), 'con el ⋯ abierto').toEqual([])
    await page.keyboard.press('Escape')
    if (isMobile) {
      await page.getByRole('button', { name: 'Pasos y combos' }).tap()
      await expect(page.getByRole('dialog', { name: 'Pasos y combos' })).toBeVisible()
      expect(await roundCorners(page), 'con el panel «Pasos y combos» abierto').toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Pasos y combos' })).toHaveCount(0)
    }

    // La hoja (celular) o el menú (escritorio) de una carta.
    const { item, name } = await monsterOf(page)
    if (isMobile) await item.tap()
    else await item.click()
    await expect(page.getByRole('menu', { name, exact: true })).toBeVisible()
    expect(await roundCorners(page), 'con la hoja o el menú de una carta').toEqual([])
  })

  test('el fondo: `mat-scene` lleva el remolino, se baja un solo AVIF por ancho y el respaldo es el carbón', async ({ page, isMobile }) => {
    const avifs = new Set<string>()
    page.on('request', (request) => {
      if (/remolino/.test(request.url())) avifs.add(new URL(request.url()).pathname.split('/').pop()!)
    })
    await openMat(page)
    const scene = page.locator('.mat-scene')
    await expect(scene).toHaveCount(1)
    const { image, color, charcoal } = await scene.evaluate((node) => {
      const probe = document.createElement('i')
      probe.style.backgroundColor = 'var(--background)'
      document.body.append(probe)
      const charcoal = getComputedStyle(probe).backgroundColor
      probe.remove()
      const style = getComputedStyle(node)
      return { image: style.backgroundImage, color: style.backgroundColor, charcoal }
    })
    expect(image).toContain('remolino')
    expect(image).toContain(isMobile ? 'remolino-medio-movil' : 'remolino-medio-escritorio')
    expect(color, 'el color de respaldo es el carbón').toBe(charcoal)
    expect(charcoal).not.toBe('rgba(0, 0, 0, 0)')
    await expect.poll(() => avifs.size, 'un solo AVIF de fondo por ancho').toBe(1)
    expect([...avifs][0]).toMatch(isMobile ? /^remolino-medio-movil-.*\.avif$/ : /^remolino-medio-escritorio-.*\.avif$/)
  })

  test('el menú manual no cambió: conserva «Al deck ›» con su submenú y no aparece ningún cartel del automático', async ({ page, isMobile }) => {
    await openMat(page)
    const { item, name } = await monsterOf(page)
    if (isMobile) await item.tap()
    else await item.click()
    const sheet = page.getByRole('menu', { name, exact: true })
    await expect(sheet).toBeVisible()
    const toDeck = sheet.getByRole('menuitem', { name: 'Al deck' })
    await expect(toDeck).toBeVisible()
    for (const play of ['Invocación Normal', 'Colocar']) await expect(sheet.getByRole('menuitem', { name: play })).toBeVisible()

    await toDeck.click()
    // El submenú: en el celular reemplaza las jugadas de la hoja; en escritorio es un menú aparte.
    for (const where of ['Arriba', 'Abajo', 'Al azar']) await expect(page.getByRole('menuitem', { name: where })).toBeVisible()
    await expect(page.locator('[data-auto-panel]')).toHaveCount(0)
  })

  test('abrir la mesa, tocar una carta y cerrarla no deja `pageerror` ni errores de consola propios', async ({ page, baseURL, isMobile }) => {
    const origin = new URL(baseURL!).origin
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      // Los pedidos cortados a propósito (el catálogo vacío, las imágenes) no son del sitio.
      if (message.type() === 'error' && message.location().url.startsWith(origin) && !/\/api\/card-image\//.test(message.location().url)) errors.push(message.text())
    })
    await openMat(page)
    const { item, name } = await monsterOf(page)
    if (isMobile) await item.tap()
    else await item.click()
    await expect(page.getByRole('menu', { name, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name, exact: true })).toHaveCount(0)
    expect(errors, 'errores de consola o de página propios').toEqual([])
  })

  test('la práctica conserva su ficha de fase en el campo, sin pista ni botón del turno, y sus dos paneles; en escritorio el menú lateral se pliega al riel de 76 px', async ({ page, isMobile }) => {
    await openMat(page)
    // Lo nuevo del automático no llega a la práctica manual: ni la pista de la línea, ni el botón del turno, ni la columna única.
    await expect(page.locator('[data-phase-track], [data-turn-action], [data-duel-line]')).toHaveCount(0)
    await expect(page.getByRole('tablist', { name: 'Panel de la mesa' })).toHaveCount(0)
    // La ficha de la fase de siempre (el botón «Fases: …» del campo) y la mano quieta al abrirla.
    const phase = mat(page).getByRole('button', { name: /^Fases: / })
    await expect(phase).toHaveCount(1)
    await expect(phase).toBeEnabled()
    if (!isMobile) {
      await expect(page.getByRole('region', { name: 'Pasos y combos' })).toBeVisible()
      expect((await page.locator('aside').first().boundingBox())!.width, 'el menú lateral en la mesa mide el riel (76 px)').toBe(76)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// El duelo AUTOMÁTICO contra el bot de handtraps: sólo existe donde están `/auto-data/*` y el núcleo (el sitio publicado o un dev server: `BASE_URL=http://ti180.localhost:5281`). Contra un preview local de `vite preview`
// (`127.0.0.1`/`localhost`), `/auto-data/*` no está: se saltea. Sólo lecturas y jugadas locales del duelo (invocar, activar una carta): no crea una sala ni envía un formulario; el núcleo corre en el navegador.
// Los casos que juegan usan un deck de 40 cartas iguales: la mano es siempre la misma y el caso no depende de la suerte del reparto.

/** «Solo» → «Jugar contra las handtraps» (con el modo de fábrica, el automático) y espera TU turno: el botón del turno habilitado (si arranca el rival, espera a que pase). */
async function startAuto(page: Page) {
  await page.goto('/#solo')
  await page.getByRole('button', { name: /^Jugar contra las handtraps/ }).click()
  await expect(mat(page)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-turn-action]')).toBeEnabled({ timeout: 90_000 })
  await expect(handList(page).getByRole('listitem').first()).toBeVisible()
}

/** Lo que hay arriba en el centro de la caja de `locator`, ¿es él (o algo adentro)? (`elementFromPoint`: nada lo tapa). */
const onTop = (locator: Locator) =>
  locator.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return Boolean(top && node.contains(top))
  })

/** El alfa del fondo del primer elemento con fondo de `locator` (él o, si es transparente, el primero de sus descendientes que lo tenga): 1 = opaco. */
const alphaOf = (locator: Locator) =>
  locator.evaluate((root) => {
    const alpha = (css: string) => {
      if (css === 'rgba(0, 0, 0, 0)' || css === 'transparent') return 0
      const modern = css.match(/\/\s*([\d.]+)(%?)\s*\)$/)
      if (modern) return modern[2] ? Number(modern[1]) / 100 : Number(modern[1])
      const legacy = css.match(/^rgba\(.*,\s*([\d.]+)\)$/)
      return legacy ? Number(legacy[1]) : 1
    }
    for (const node of [root, ...root.querySelectorAll('*')]) {
      const a = alpha(getComputedStyle(node).backgroundColor)
      if (a > 0) return a
    }
    return 0
  })

const press = (locator: Locator, isMobile: boolean) => (isMobile ? locator.tap() : locator.click())

/** Los botones de jugada y de navegación de una hoja: lo que hay arriba en el centro de cada uno es ese botón. Con `poll`: la hoja entra deslizándose. */
const expectReachable = (buttons: Locator, what: string) =>
  expect
    .poll(() => buttons.evaluateAll((nodes) => nodes.filter((node) => { const box = node.getBoundingClientRect(); const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return !(top && node.contains(top)) }).length), { message: `${what} tapados por otra capa` })
    .toBe(0)

/** Activa Ookazi de la mano (Mágica normal: no pide nada, no la frena un handtrap y termina en el Cementerio) y espera a que se resuelva. */
async function sendOokaziToGrave(page: Page, isMobile: boolean) {
  await press(handList(page).getByRole('listitem', { name: 'Ookazi', exact: true }).first(), isMobile)
  const activate = page.locator('[data-auto-panel]').getByRole('menuitem', { name: /^Activar/ })
  await expect(activate).toBeVisible()
  await press(activate.first(), isMobile)
  // Una Mágica pide la casilla: una de las elegibles.
  const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
  await expect(zones.first()).toBeVisible()
  await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)
  await expect(page.locator('[data-drop="gy"]').first()).toHaveAccessibleName('GY: 1', { timeout: 30_000 })
  await expect(page.locator('[data-turn-action]')).toBeEnabled({ timeout: 30_000 })
}

test.describe('duelo automático (donde están el núcleo y /auto-data: el sitio publicado o un dev server)', () => {
  test.skip(({ baseURL }) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(baseURL ?? ''), 'necesita /auto-data/* y el núcleo: no están en un preview local')

  test('en reposo: la pista de fases en la línea (nunca vacía, ningún «Fases:» en el campo), el botón del turno al alcance, la ficha opaca con sus jugadas tocables, las fases cuadradas y, en el celular, las chapas', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    await prepare(context, true)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    await startAuto(page)
    // Tu DP y tu SP pasan solas hasta la Main Phase 1 (el núcleo pregunta qué hacés): ahí la pista se habilita.
    const line = page.locator('[data-duel-line]')
    const track = line.locator('[data-phase-track]')
    await expect(track).toHaveAccessibleName('Fases: Main Phase 1', { timeout: 60_000 })
    await expect(track).toBeEnabled()
    await watchYs(page)

    // La pista (TI-174): seis casillas, la de ahora marcada, y la línea no queda vacía en reposo. Es el único «Fases:» de la mesa y no hay ninguno dentro del campo (la ficha «M1» ya no está).
    await expect(track.locator('span[aria-hidden="true"] > span')).toHaveText(['DP', 'SP', 'M1', 'BP', 'M2', 'EP'])
    await expect(track.locator('[data-now]')).toHaveText('M1')
    expect((await line.innerText()).trim(), 'la línea en reposo no queda vacía').not.toBe('')
    await expect(page.getByRole('button', { name: /^Fases: / })).toHaveCount(1)
    await expect(mat(page).locator('[aria-label="Campo"]').getByRole('button', { name: /^Fases: / })).toHaveCount(0)
    await expect.poll(() => onTop(track), { message: 'lo que hay arriba de la pista es la pista' }).toBe(true)

    // El botón del turno (TI-174): «Ir a Batalla» o «Terminar turno», de ≥ 44 px, sin nada encima y, en el celular, abajo (zona del pulgar).
    const turn = page.locator('[data-turn-action]')
    await expect(turn).toHaveText(/^(Ir a Batalla|Terminar turno)$/)
    const turnBox = (await turn.boundingBox())!
    expect(turnBox.height, 'alto del botón del turno').toBeGreaterThanOrEqual(44)
    expect(turnBox.width, 'ancho del botón del turno').toBeGreaterThanOrEqual(44)
    if (isMobile) expect(turnBox.y, 'el botón del turno abajo, en la zona del pulgar').toBeGreaterThan(page.viewportSize()!.height * 0.8)
    // Con poll: al arrancar, las cartas del reparto todavía vuelan por encima.
    await expect.poll(() => onTop(turn), { message: 'lo que hay arriba del botón del turno es el botón' }).toBe(true)
    await expect(handList(page).getByRole('listitem').first()).toBeVisible()

    // Las chapas y la línea (celular): «Vos» y «Rival» a la vista, la barra sin el marcador de vidas y la línea con el mismo alto antes y después.
    const lineHeight = () => line.evaluate((node) => node.getBoundingClientRect().height)
    const before = isMobile ? await lineHeight() : 0
    if (isMobile) {
      await expect(page.getByLabel(/^Puntos de vida de Vos: /)).toBeVisible()
      await expect(page.getByLabel(/^Puntos de vida de Rival: /)).toBeVisible()
      await expect(line).toHaveCount(1)
      expect(await page.locator('[data-life-score]').evaluateAll((nodes) => nodes.map((node) => node.hasAttribute('data-life-badge'))), 'toda marca de vidas es una chapa: la barra no lleva el marcador').toEqual([true, true])
    }

    // La ficha de un monstruo de la mano (con Invocar y Colocar): de 1 a 4 jugadas, sin «Más» ni submenú y sin contador «1/1».
    const monster = handList(page).getByRole('listitem').filter({ hasNotText: /Dark Hole|Mirror Force/ })
    const name = (await monster.first().getAttribute('aria-label'))!
    await press(monster.first(), isMobile)
    const sheet = page.locator('[data-auto-panel]').filter({ has: page.getByRole('menuitem') })
    await expect(sheet).toBeVisible()
    const plays = sheet.getByRole('menuitem')
    expect(await plays.count(), `jugadas de ${name}`).toBeGreaterThanOrEqual(1)
    expect(await plays.count(), `jugadas de ${name}`).toBeLessThanOrEqual(4)
    await expect(sheet.getByRole('menuitem', { name: /^Más/ })).toHaveCount(0)
    // Sólo en los carteles del automático: la franja «Paso actual» de la mesa lleva su propio «2/2» y no es el contador de elegir.
    await expect(page.locator('[data-auto-panel]').getByText(/^\d+\s*\/\s*\d+$/)).toHaveCount(0)
    if (isMobile) expect(await lineHeight(), 'alto de la línea con la ficha abierta').toBe(before)
    // Nada tapa las jugadas (TI-161: la tira del visor de una pila quedaba encima): lo que hay arriba en el centro de cada botón es ese botón.
    await expectReachable(plays, 'jugadas')
    // La hoja es opaca (TI-171: alfa 1) y no lleva esquinas redondas.
    expect(await alphaOf(sheet), 'alfa del fondo de la ficha').toBe(1)
    expect(await roundCorners(page), 'con la ficha abierta').toEqual([])
    // Cada chapa muestra un solo número (TI-161: «75007500», el número viejo quedaba pegado al nuevo).
    if (isMobile) expect(await page.locator('[data-life-badge] .text-stat').allTextContents(), 'el número de cada chapa').toEqual([expect.stringMatching(/^\d{1,5}$/), expect.stringMatching(/^\d{1,5}$/)])
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    // Sin Nivel a la vista en reposo (TI-173: va a la ficha de la carta; sólo vuelve mientras se eligen materiales).
    await expect(page.locator('[data-stat-badge]:visible')).toHaveCount(0)

    // Las fases se abren desde la pista (TI-174; conserva el nombre «Fases: Main Phase 1»): seis botones cuadrados (la caja de cada uno mide lo mismo de ancho que de alto, ±1 px).
    await track.click()
    const phases = page.getByRole('menu', { name: 'Elegí la fase a la que pasás' }).getByRole('menuitem')
    await expect(phases).toHaveCount(6)
    const boxes = await phases.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = (node.firstElementChild ?? node).getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    for (const { width, height } of boxes) expect(Math.abs(width - height), `caja de fase de ${width}×${height}`).toBeLessThanOrEqual(1)
    expect(await roundCorners(page), 'con las fases abiertas').toEqual([])
    await page.keyboard.press('Escape')
    await expect(phases).toHaveCount(0)
    if (isMobile) expect(await lineHeight(), 'alto de la línea tras la jugada').toBe(before)
    expectStill(await readYs(page), 'al abrir la ficha y las fases')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
    expect(errors, 'errores de página propios').toEqual([])
  })

  test('invocar un monstruo: su ATK va en una placa al pie de la carta, ningún Nivel a la vista, y el campo y tu mano no se mueven', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    await prepare(context, true, warwolfDeck)
    await startAuto(page)
    await expect(page.locator('[data-stat-badge]:visible'), 'sin Nivel a la vista en reposo').toHaveCount(0)
    await watchYs(page)

    await press(handList(page).getByRole('listitem').first(), isMobile)
    const summon = page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Invocación Normal' })
    await expect(summon).toBeVisible()
    await press(summon, isMobile)
    // La casilla: una del medio de las elegibles.
    const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
    await expect(zones.first()).toBeVisible()
    await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)

    // La placa de ATK: al pie de la carta (su borde de abajo es el de la carta), de ≤ 15 px de alto, con el ATK impreso de la carta.
    const stat = mat(page).locator('[aria-label="Campo"] [data-pick-stat]')
    await expect(stat).toHaveCount(1)
    await expect(stat).toBeVisible()
    await expect(stat).toHaveText(/^2000/)
    await expect(page.locator('[data-stat-badge]:visible'), 'sin Nivel a la vista con el monstruo invocado').toHaveCount(0)
    const { chip, cell } = await stat.evaluate((node) => {
      const zone = node.closest('[data-drop]')!.getBoundingClientRect()
      const box = node.getBoundingClientRect()
      return { chip: { height: box.height, top: box.top }, cell: { top: zone.top, height: zone.height } }
    })
    expect(chip.height, 'alto de la placa de ATK').toBeLessThanOrEqual(15.5)
    // La mesa en 3D inclina la casilla: el borde exacto no se mide; la placa tiene que ir en el tercio de abajo de la carta.
    expect(chip.top, 'la placa de ATK al pie de la carta').toBeGreaterThanOrEqual(cell.top + cell.height * 0.6)
    await expect(page.locator('[data-turn-action]')).toBeEnabled({ timeout: 30_000 })
    expectStill(await readYs(page), 'al invocar')
  })

  test('el Cementerio: la carta se abre y «‹ GY» vuelve al visor (celular) o la ficha va a la pestaña «Carta» (escritorio); hojas opacas, y la y del campo y de tu mano quietas', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    await prepare(context, true, ookaziDeck)
    await startAuto(page)
    await sendOokaziToGrave(page, isMobile)
    await watchYs(page)

    await press(page.locator('[data-drop="gy"]').first(), isMobile)
    if (isMobile) {
      // El visor de la pila abajo; tocar la carta abre su ficha con «‹ GY · 1» arriba (TI-171) y el visor se esconde.
      const pile = page.locator('[data-pile-sheet]')
      await expect(pile).toBeVisible()
      await expectReachable(pile.getByRole('button'), 'botones del visor')
      expect(await alphaOf(pile), 'alfa del fondo del visor de la pila').toBe(1)
      await press(pile.getByRole('button', { name: 'Ookazi', exact: true }), isMobile)
      const sheet = page.locator('[data-auto-panel]')
      const back = sheet.getByRole('button', { name: /^Volver a GY/ })
      await expect(back).toBeVisible()
      await expect(sheet.getByText('Ookazi', { exact: true }).first()).toBeVisible()
      expect(await alphaOf(sheet), 'alfa del fondo de la ficha').toBe(1)
      await expectReachable(sheet.getByRole('button'), 'botones de la ficha')
      await expect.poll(() => onTop(back), { message: 'lo que hay arriba de «‹ GY» es el botón' }).toBe(true)
      expect((await back.boundingBox())!.height, 'alto de «‹ GY»').toBeGreaterThanOrEqual(44)
      // «‹ GY» vuelve al visor con su carta.
      await press(back, isMobile)
      await expect(sheet).toHaveCount(0)
      await expect(pile).toBeVisible()
      await expect(pile.getByRole('button', { name: 'Ookazi', exact: true })).toBeVisible()
      await expectReachable(pile.getByRole('button'), 'botones del visor al volver')
    } else {
      // En escritorio el visor es una ventana chica y la ficha va a la columna, en «Carta».
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await press(dialog.getByRole('button', { name: 'Ookazi', exact: true }), isMobile)
      await expect(page.getByRole('tab', { name: 'Carta' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-auto-panel]').getByText('Ookazi', { exact: true }).first()).toBeVisible()
    }
    expectStill(await readYs(page), 'al abrir el Cementerio, una carta y volver')
  })

  test('esquinas rectas con el visor del Cementerio abierto', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    await prepare(context, true, ookaziDeck)
    await startAuto(page)
    await sendOokaziToGrave(page, isMobile)
    await press(page.locator('[data-drop="gy"]').first(), isMobile)
    await expect(isMobile ? page.locator('[data-pile-sheet]') : page.getByRole('dialog')).toBeVisible()
    expect(await roundCorners(page), 'con el visor de la pila abierto').toEqual([])
  })

  test('escritorio: el menú lateral de 76 px, la casilla de ≥ 88 px, la columna «Carta · Cadena · Pasos» y la línea con la pista y el botón del turno', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'sólo escritorio (1440×900)')
    test.setTimeout(120_000)
    await prepare(context, true)
    await startAuto(page)
    await watchYs(page)

    // TI-176: en la mesa el menú lateral se pliega al riel.
    expect((await page.locator('aside').first().boundingBox())!.width, 'el menú lateral en la mesa').toBe(76)
    // TI-177: la casilla del medio mide ≥ 88 px y la mesa entra sin scroll.
    const cell = await mat(page).locator('[data-drop="mz:0"]').first().evaluate((node) => (node as HTMLElement).offsetWidth)
    expect(cell, 'ancho de la casilla a 1440×900').toBeGreaterThanOrEqual(88)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 'scroll vertical del documento').toBeLessThanOrEqual(0)
    // TI-178: una sola columna con tres pestañas, navegables con flechas.
    const tablist = page.getByRole('tablist', { name: 'Panel de la mesa' })
    await expect(tablist.getByRole('tab')).toHaveCount(3)
    const [card, chain, steps] = ['Carta', 'Cadena', 'Pasos'].map((name) => tablist.getByRole('tab', { name, exact: true }))
    await expect(steps).toBeVisible()
    await card.click()
    await expect(card).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(chain).toHaveAttribute('aria-selected', 'true')
    await card.click()
    // TI-174/177: la pista y el botón del turno comparten la línea, que no queda vacía.
    const line = page.locator('[data-duel-line]')
    await expect(line.locator('[data-phase-track]')).toBeVisible()
    await expect(line.locator('[data-turn-action]')).toBeVisible()
    // Con una ficha abierta (en «Carta»): cero radios y la y del campo y de tu mano quietas.
    // Un monstruo de la mano (una Mágica o Trampa suelta no tiene jugadas).
    await handList(page).getByRole('listitem').filter({ hasNotText: /Dark Hole|Mirror Force/ }).first().click()
    await expect(page.locator('[data-auto-panel]').filter({ has: page.getByRole('menuitem') })).toBeVisible()
    expect(await roundCorners(page), 'con la ficha abierta en la columna').toEqual([])
    expectStill(await readYs(page), 'al abrir la ficha y cambiar de pestaña')
  })
})
