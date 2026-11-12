// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): la mesa del duelo con el kit aprobado (TI-190 a TI-198; QA del conjunto, TI-199) y la práctica manual, en celular (390×844, con toque) y en escritorio (1440×900).
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador y el deck se siembra en el `localStorage` de la prueba. El catálogo de YGOPRODeck se responde vacío y las imágenes de cartas se cortan.
// Dos grupos: la práctica MANUAL (`ygo-lab:auto-duel` en «off»: «Solo» → «Jugar contra las handtraps» abre la mesa sin núcleo ni relay) y el duelo AUTOMÁTICO (necesita `/auto-data/*` y el núcleo: el sitio publicado o un dev server,
// p. ej. `BASE_URL=http://ti199.localhost:5299`; contra `127.0.0.1`/`localhost` se saltea).
// Manual: 7 pistas y sin scroll horizontal, el campo y tu mano quietos (`y` idéntica) al abrir una carta, ningún `border-radius` distinto de 0, un solo AVIF de fondo por ancho, el menú manual intacto (con «Al deck ›») y su ficha de fase.
// Automático (V-01 / V-04, un turno; V-04, escritorio; V-02, elegir varias): el botón de fase al centro entre las dos Zonas Extra (sin pista ni botón del turno), la chapa con borde grueso como turno, la ficha con la principal a la derecha, la
// placa ATK/DEF, la cadena en grande aun para una activación sola, las vidas contando dentro de la chapa, el visor con copias agrupadas, el menú de fases pegado al botón, los dos paneles de escritorio y la `y` del campo y de tu mano sin moverse.
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
    const roots = new Set<Element>([document.querySelector('[aria-label="Mesa de práctica"]')!, ...Array.from(document.querySelectorAll('.mat-square, [data-auto-panel], [data-pile-sheet]'))])
    const all = new Set<Element>()
    for (const root of roots) for (const node of [root, ...Array.from(root.querySelectorAll('*'))]) all.add(node)
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
// El duelo AUTOMÁTICO contra el bot de handtraps (el kit aprobado, TI-190 a TI-198; QA del conjunto, TI-199): sólo existe donde están `/auto-data/*` y el núcleo (el sitio publicado o un dev server: `BASE_URL=http://ti199.localhost:5299`).
// Contra un preview local de `vite preview` (`127.0.0.1`/`localhost`) no están: se saltea. Sólo lecturas y jugadas locales del duelo (invocar, activar una carta): no crea una sala ni envía un formulario; el núcleo corre en el navegador.
// El deck del duelo es de 40 cartas (20 Gene-Warped Warwolf y 20 Ookazi: un monstruo para invocar y una Mágica que nadie puede responder) y el azar va sembrado: la mano es siempre la misma y el caso no depende de la suerte del reparto.

/** `Math.random` determinista (mulberry32): se pisa en cada carga, antes de que arranque la app. */
const SEEDED = () => {
  let s = 20261112
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPELL = { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }
const WARWOLF = { cardType: 'Normal Monster', frameType: 'normal', race: 'Beast-Warrior', attribute: 'EARTH', level: 4, atk: '2000', def: '100' }
const duelDeck = stateOf([...Array.from({ length: 20 }, () => card(69247929, 'Gene-Warped Warwolf', WARWOLF)), ...Array.from({ length: 20 }, () => card(19523799, 'Ookazi', SPELL))])

const PHASE = 'button[aria-label^="Fases: "]'
const phaseButton = (page: Page) => page.getByRole('button', { name: /^Fases: / })

/** «Solo» → «Jugar contra las handtraps» (con el modo de fábrica, el automático) y espera TU turno: el botón de fase del centro habilitado (si arranca el rival, espera a que pase). */
async function startAuto(page: Page) {
  await page.goto('/#solo')
  await page.getByRole('button', { name: /^Jugar contra las handtraps/ }).click()
  await expect(mat(page)).toBeVisible({ timeout: 60_000 })
  await expect(phaseButton(page)).toBeEnabled({ timeout: 90_000 })
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
    for (const node of [root, ...Array.from(root.querySelectorAll('*'))]) {
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

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number }
const boxOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const node = Array.from(document.querySelectorAll(sel)).find((candidate) => candidate.getClientRects().length > 0)
    if (!node) return null
    const b = node.getBoundingClientRect()
    return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }
  }, selector) as Promise<Box | null>

/** B-01 a B-04: cada botón de la fila de jugadas de una hoja o ventana mide ≥ 44 px, va en un renglón, la principal es la última (la de más a la derecha) y va rellena, y no se estira a todo el ancho de una ventana de escritorio. */
async function expectActionRow(page: Page, what: string, windowed: boolean) {
  // Con poll: la hoja y la ventana entran con una animación de escala.
  await expect
    .poll(() => page.evaluate(() => Math.min(...Array.from(document.querySelectorAll('[data-auto-panel] [role=menu] button')).map((node) => node.getBoundingClientRect().height))), { message: `${what}: alto de los botones` })
    .toBeGreaterThanOrEqual(44)
  const row = await page.evaluate(() => {
    const menu = Array.from(document.querySelectorAll('[data-auto-panel] [role=menu]')).find((node) => node.getClientRects().length > 0)
    if (!menu) return null
    const panel = menu.closest('[data-auto-panel]')!.getBoundingClientRect()
    const buttons = Array.from(menu.querySelectorAll('button')).map((node) => {
      const b = node.getBoundingClientRect()
      return { text: node.textContent!.trim(), w: b.width, h: b.height, right: b.right, oneLine: node.scrollHeight <= node.clientHeight + 1, bg: getComputedStyle(node).backgroundColor }
    })
    return { buttons, panel: { right: panel.right, w: panel.width } }
  })
  expect(row, `${what}: la fila de jugadas`).not.toBeNull()
  const { buttons, panel } = row!
  expect(buttons.length, `${what}: botones`).toBeGreaterThanOrEqual(1)
  for (const button of buttons) {
    expect(button.h, `${what}: alto de «${button.text}»`).toBeGreaterThanOrEqual(44)
    expect(button.oneLine, `${what}: «${button.text}» en un renglón`).toBe(true)
    expect(button.text, `${what}: sin «CL» en un botón`).not.toMatch(/\bCL\d/)
  }
  const rightmost = Math.max(...buttons.map((button) => button.right))
  expect(buttons.at(-1)!.right, `${what}: la principal es la de más a la derecha`).toBe(rightmost)
  if (buttons.length > 1) expect(buttons.at(-1)!.bg, `${what}: la principal va rellena (distinta de las otras)`).not.toBe(buttons[0]!.bg)
  if (windowed) expect(Math.max(...buttons.map((button) => button.w)), `${what}: los botones van a su ancho y no a toda la ventana`).toBeLessThan(panel.w * 0.6)
}

const MENU_OWN = /\b(Turno|Main Phase|Standby Phase|Draw Phase|Battle Phase|End Phase)\b/

test.describe('duelo automático (donde están el núcleo y /auto-data: el sitio publicado o un dev server)', () => {
  test.skip(({ baseURL }) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(baseURL ?? ''), 'necesita /auto-data/* y el núcleo: no están en un preview local')

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(SEEDED)
    await prepare(context, true, duelDeck)
  })

  // V-01 (celular, en 3D) y V-04 (escritorio, en 3D): el turno entero con las piezas del kit. Un solo duelo y muchos pasos: arrancar el núcleo cuesta.
  test('V-01 / V-04, un turno: el botón de fase al centro, la ficha, invocar, la placa, la activación sola, el daño en la chapa, las fases y terminar; el campo y tu mano no se mueven', async ({ page, isMobile }) => {
    test.setTimeout(240_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    await startAuto(page)

    await test.step('C-01 / C-02: el botón de fase es el único «Fases:», está entre las dos Zonas Extra, sin pista ni botón del turno, y no hay scroll', async () => {
      await expect(phaseButton(page)).toHaveCount(1)
      await expect(page.locator('[data-phase-track], [data-turn-action], [data-prompt-turn], [data-panel-fold]')).toHaveCount(0)
      expect(await page.locator('[data-duel-line]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)), 'la línea de abajo del campo es sólo una marca de 0 px').toEqual(expect.arrayContaining([]))
      for (const height of await page.locator('[data-duel-line]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))) expect(height).toBeLessThanOrEqual(0.5)
      const [field, phase, emz0, emz1] = await Promise.all(['[aria-label="Campo"]', PHASE, '[data-drop="emz:0"]', '[data-drop="emz:1"]'].map((selector) => boxOf(page, selector)))
      expect(Math.abs(phase!.cx - field!.cx), 'el centro del botón de fase y el del campo').toBeLessThanOrEqual(2)
      expect(phase!.cx, 'el botón de fase entre las dos Zonas Extra').toBeGreaterThan(Math.min(emz0!.cx, emz1!.cx))
      expect(phase!.cx).toBeLessThan(Math.max(emz0!.cx, emz1!.cx))
      expect(phase!.cy, 'en la fila de las Zonas Extra').toBeGreaterThan(emz0!.y)
      expect(phase!.cy).toBeLessThan(emz0!.y + emz0!.h)
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 'scroll vertical del documento').toBeLessThanOrEqual(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
      if (isMobile) {
        // Casillas con forma de carta y sin hueco entre el campo y la mano.
        const ratio = await mat(page).locator('[data-drop="mz:2"]').first().evaluate((node) => (node as HTMLElement).offsetHeight / (node as HTMLElement).offsetWidth)
        expect(ratio, 'alto/ancho de la casilla del medio (forma de carta)').toBeGreaterThanOrEqual(1.4)
        const hand = (await boxOf(page, '[role=list][aria-label=Mano]'))!
        expect(hand.y - (field!.y + field!.h), 'del borde de abajo del campo al de arriba de tu mano').toBeLessThanOrEqual(40)
        expect((await boxOf(page, '[data-lp=theirs]'))!.y + (await boxOf(page, '[data-lp=theirs]'))!.h, 'las vidas del rival en la barra de arriba, sobre el campo').toBeLessThanOrEqual(field!.y)
      }
    })

    await test.step('F-01 / F-02: la chapa del que juega lleva borde de 3 px (ése es el turno), la otra, tenue, y ninguna dice «Turno»', async () => {
      const mine = page.locator('[data-life-badge][data-lp=mine]')
      const theirs = page.locator('[data-life-badge][data-lp=theirs]')
      await expect(mine).toHaveCount(1)
      await expect(theirs).toHaveCount(1)
      expect(await mine.evaluate((node) => getComputedStyle(node).borderTopWidth), 'borde de tu chapa en tu turno').toBe('3px')
      expect(await theirs.evaluate((node) => getComputedStyle(node).borderTopWidth), 'borde de la chapa del rival en tu turno').not.toBe('3px')
      for (const badge of [mine, theirs]) expect((await badge.innerText()).toLowerCase(), 'la chapa no dice de quién es el turno').not.toContain('turno')
      for (const badge of [mine, theirs]) expect(((await badge.innerText()).match(/\d+/g) ?? []).length, 'cada chapa muestra un solo número (TI-161: «75007500»)').toBe(1)
    })
    await watchYs(page)

    await test.step('M-01 / B-01 / B-04: la ficha de un monstruo de la mano (sin «Mano», sin fase ni turno), con Colocar e Invocar: la principal a la derecha y rellena', async () => {
      const name = 'Gene-Warped Warwolf'
      const item = handList(page).getByRole('listitem', { name, exact: true }).first()
      await press(item, isMobile)
      const sheet = page.locator('[data-auto-panel]').filter({ has: page.getByRole('menuitem') })
      await expect(sheet).toBeVisible()
      const text = await sheet.innerText()
      expect(text, `la ficha de ${name} no repite ni la fase ni el turno`).not.toMatch(MENU_OWN)
      expect(text, 'la ficha no dice «Mano»: ya la tocaste ahí').not.toMatch(/\bMano\b/)
      await expect(sheet.getByRole('menuitem')).toHaveText(['Colocar', 'Invocación Normal'])
      await expect(page.locator('[data-prompt-turn], [data-panel-fold]')).toHaveCount(0)
      await expectReachable(sheet.getByRole('menuitem'), 'jugadas')
      await expectActionRow(page, 'ficha del monstruo', !isMobile)
      if (isMobile) {
        expect(await alphaOf(sheet), 'alfa del fondo de la ficha').toBe(1)
        await expect(sheet.getByRole('button', { name: /^Minimizar/ })).toBeVisible()
      } else {
        expect((await boxOf(page, '[data-auto-panel="floating"]'))!.w, 'la ventana de escritorio, apaisada y de ≤ 480 px').toBeLessThanOrEqual(482)
        await expect(page.locator('[data-card-dock]'), 'el detalle de la carta tocada, en su panel de la izquierda').toContainText(name)
      }
      expect(await roundCorners(page), 'con la ficha abierta').toEqual([])
      // M-06: el menú de jugadas sigue en la ficha; «Invocación Normal» pide la casilla y deja sólo la tira.
      await press(sheet.getByRole('menuitem', { name: 'Invocación Normal' }), isMobile)
      const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
      await expect(zones.first()).toBeVisible()
      if (isMobile) {
        await expect(page.getByText(/^Elegí una casilla$/).first(), 'la frase corta: la carta ya está levantada en tu mano').toBeVisible()
        await expect(page.locator('[data-auto-panel]'), 'la hoja de la ficha se fue: sólo queda la tira').toHaveCount(0)
        const cancel = page.getByRole('button', { name: 'Cancelar', exact: true })
        await expect(cancel).toBeVisible()
        const stripHeight = await cancel.evaluate((button) => { let node: HTMLElement | null = button.parentElement; while (node && !/Elegí una casilla/.test(node.innerText)) node = node.parentElement; return node ? node.getBoundingClientRect().height : 9999 })
        expect(stripHeight, 'elegir en la mesa: una tira de un renglón y ≤ 56 px').toBeLessThanOrEqual(56)
      }
      await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)
    })

    await test.step('C-01 / F-04: la placa al pie de la carta lleva los dos números (ATK/DEF) en un renglón', async () => {
      const stat = mat(page).locator('[aria-label="Campo"] [data-pick-stat]')
      await expect(stat).toHaveCount(1)
      await expect(stat).toBeVisible()
      await expect(stat).toHaveText(/^2000\s*\/\s*100$/)
      const { chip, cell, fontSize } = await stat.evaluate((node) => {
        const zone = node.closest('[data-drop]')!.getBoundingClientRect()
        const box = node.getBoundingClientRect()
        return { chip: { height: box.height, top: box.top, width: box.width }, cell: { top: zone.top, height: zone.height, width: zone.width }, fontSize: parseFloat(getComputedStyle(node).fontSize) }
      })
      expect(chip.height, 'alto de la placa').toBeLessThanOrEqual(15.5)
      expect(fontSize, 'la letra de la placa').toBeGreaterThanOrEqual(10)
      expect(chip.top, 'la placa al pie de la carta').toBeGreaterThanOrEqual(cell.top + cell.height * 0.6)
      await expect(page.locator('[data-stat-badge]:visible'), 'sin Nivel a la vista con el monstruo en reposo').toHaveCount(0)
      await expect(phaseButton(page)).toBeEnabled({ timeout: 30_000 })
    })

    await test.step('M-02 / K-01 / F-05: una Mágica que nadie responde dice «Activar» y entra igual como una carta grande inclinada, con su «1», se resuelve y se va; las vidas del rival bajan contando dentro de su chapa', async () => {
      // El observador: la escena de la cadena (carta, pose, inclinación), los carteles de «Activar» y todo número de daño fuera de una chapa.
      await page.evaluate(`(() => {
        const seen = { stage: [], status: [], spot: 0, outside: [], life: [], t0: 0 }
        window.__k = seen
        const side = () => document.querySelector('[data-life-badge][data-lp=theirs] .text-stat, [data-life-badge][data-lp=theirs] .text-lead')?.textContent ?? ''
        const tick = () => {
          const now = performance.now()
          const stage = document.querySelector('[data-chain-stage]')
          if (stage) {
            for (const card of stage.querySelectorAll('[data-chain-card]')) seen.stage.push({ n: card.dataset.chainCard, pose: card.dataset.pose, rotate: getComputedStyle(card).rotate, t: now, w: card.offsetWidth, layer: stage.offsetWidth, label: card.getAttribute('aria-label') })
            const status = stage.querySelector('[role=status]')
            if (status && !seen.status.includes(status.textContent)) seen.status.push(status.textContent)
            seen.pe = getComputedStyle(document.querySelector('[data-testid=duel-chain-layer]')).pointerEvents
          }
          if (document.querySelector('[data-spot]')) seen.spot += 1
          for (const node of document.body.querySelectorAll('*')) if (!node.children.length && /^[−+-]\\s?\\d{3,5}$/.test(node.textContent.trim()) && node.getBoundingClientRect().width && !node.closest('[data-life-badge]')) { const text = node.textContent.trim(); if (!seen.outside.includes(text)) seen.outside.push(text) }
          const life = side()
          if (seen.life.at(-1)?.v !== life) seen.life.push({ v: life, t: now })
          requestAnimationFrame(tick)
        }
        tick()
      })()`)
      await press(handList(page).getByRole('listitem', { name: 'Ookazi', exact: true }).first(), isMobile)
      const activate = page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Activar', exact: true })
      await expect(activate, 'la jugada dice «Activar» y no «Activar como CL1»').toBeVisible()
      await expect(page.locator('[data-auto-panel]').getByRole('menuitem', { name: /\bCL\d/ })).toHaveCount(0)
      await expectActionRow(page, 'ficha de la Mágica', !isMobile)
      await press(activate, isMobile)
      const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
      await expect(zones.first()).toBeVisible()
      await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)
      await expect(page.locator('[data-chain-stage]'), 'la activación sola también entra en la escena de la cadena').toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-chain-stage]'), 'y se va sola').toHaveCount(0, { timeout: 20_000 })
      await expect(phaseButton(page)).toBeEnabled({ timeout: 30_000 })
      await expect(page.locator('[data-life-badge][data-lp=theirs]')).toContainText('7200')
      const k = (await page.evaluate(() => (window as unknown as { __k: unknown }).__k)) as {
        stage: { n: string; pose: string; rotate: string; t: number; w: number; layer: number; label: string }[]
        status: string[]
        spot: number
        outside: string[]
        pe: string
        life: { v: string; t: number }[]
      }
      const cards = new Set(k.stage.map((frame) => frame.n))
      expect([...cards], 'una activación sola: un solo eslabón, el 1').toEqual(['1'])
      expect(k.stage.some((frame) => frame.pose === 'center'), 'la carta pasa al centro a resolverse').toBe(true)
      const tilts = k.stage.filter((frame) => frame.pose === 'slot').map((frame) => Math.abs(parseFloat(frame.rotate)))
      expect(tilts.length, 'la carta se ve en su lugar, inclinada').toBeGreaterThan(0)
      expect(tilts.some((angle) => angle >= 3 && angle <= 7), `inclinación de la carta (${tilts.slice(0, 3).join(', ')}°)`).toBe(true)
      expect(k.stage[0]!.w / k.stage[0]!.layer, 'la carta de la cadena mide ≈ 1/3 del ancho de la escena').toBeGreaterThan(0.25)
      expect(k.stage[0]!.w / k.stage[0]!.layer).toBeLessThan(0.45)
      expect(k.stage[0]!.label, 'el eslabón dice su número y su carta').toContain('Ookazi')
      expect(k.pe, 'la capa de la cadena no ataja toques').toBe('none')
      const lines = [...k.status]
      expect(lines.length, 'una sola línea de estado').toBeGreaterThan(0)
      for (const line of lines) expect(line, 'la línea de estado no escribe «CL»').not.toMatch(/\bCL\d/)
      expect(lines.some((line) => line === 'Se resuelve del último al primero'), 'armando: «Se resuelve del último al primero»').toBe(true)
      expect(k.spot, 'sin Spotlight de activar mientras corre la cadena del automático').toBe(0)
      // F-02: el número baja contando dentro de la chapa (8000 → 7200 en ≤ 700 ms) y ningún «−N» queda fuera de ella.
      expect(k.outside, 'ningún número de daño fuera de la chapa').toEqual([])
      const counted = k.life.map((entry) => entry.v)
      expect(counted.at(-1)).toBe('7200')
      const from = k.life.findIndex((entry) => entry.v !== '8000')
      expect(k.life.at(-1)!.t - k.life[from]!.t, 'el número llega al nuevo en ≤ 700 ms').toBeLessThanOrEqual(700)
      expect(counted.length - from, 'cuenta: pasa por valores intermedios').toBeGreaterThan(1)
      await expect(page.locator('[data-life-delta]:visible').filter({ hasNot: page.locator('xpath=ancestor::*[@data-life-badge]') })).toHaveCount(0)
    })

    await test.step('P-01 / P-02: el Cementerio con dos Ookazi las agrupa («×2»); tocar el grupo abre su ficha y «‹ GY» vuelve al visor (nunca dos hojas)', async () => {
      await press(handList(page).getByRole('listitem', { name: 'Ookazi', exact: true }).first(), isMobile)
      await press(page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Activar', exact: true }), isMobile)
      const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
      await expect(zones.first()).toBeVisible()
      await press(zones.nth(Math.min(3, (await zones.count()) - 1)), isMobile)
      await expect(page.locator('[data-drop="gy"]').first()).toHaveAccessibleName('GY: 2', { timeout: 30_000 })
      await expect(phaseButton(page)).toBeEnabled({ timeout: 30_000 })
      await press(page.locator('[data-drop="gy"]').first(), isMobile)
      const viewer = isMobile ? page.locator('[data-pile-sheet]') : page.getByRole('dialog')
      await expect(viewer).toBeVisible()
      const group = viewer.getByRole('button', { name: 'Ookazi, 2 copias' })
      await expect(group, 'las dos copias van agrupadas en un solo botón').toHaveCount(1)
      await expect(viewer.getByText('×2')).toBeVisible()
      await expect(viewer).toContainText(/GY\s*·\s*2/)
      await expectReachable(viewer.getByRole('button'), 'botones del visor')
      if (isMobile) expect(await alphaOf(viewer), 'alfa del fondo del visor de la pila').toBe(1)
      await press(group, isMobile)
      const sheet = page.locator('[data-auto-panel]')
      if (isMobile) {
        const back = sheet.getByRole('button', { name: /^Volver a GY/ })
        await expect(back).toBeVisible()
        await expect(viewer, 'la ficha reemplaza al visor: nunca dos hojas').toBeHidden()
        expect((await back.boundingBox())!.height, 'alto de «‹ GY»').toBeGreaterThanOrEqual(44)
        await expect.poll(() => onTop(back), { message: 'lo que hay arriba de «‹ GY» es el botón' }).toBe(true)
        await expect(sheet).not.toContainText(/\bMano\b/)
        await press(back, isMobile)
        await expect(sheet).toHaveCount(0)
        await expect(viewer).toBeVisible()
        await expect(viewer.getByRole('button', { name: 'Ookazi, 2 copias' })).toBeVisible()
      } else {
        await expect(page.locator('[data-card-dock]'), 'el detalle de la carta, en su panel de la izquierda').toContainText('Ookazi')
      }
      expect(await roundCorners(page), 'con el visor de la pila abierto').toEqual([])
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(viewer).toHaveCount(0)
    })

    await test.step('M-04: el menú de fases se abre pegado al botón con sólo adónde se puede ir (y «Terminar el turno»); no hay otra lista de fases; Escape lo cierra', async () => {
      const phase = (await boxOf(page, PHASE))!
      await press(phaseButton(page), isMobile)
      const menu = page.getByRole('menu', { name: 'Elegí la fase a la que pasás' })
      await expect(menu).toBeVisible()
      const box = (await menu.boundingBox())!
      const gap = box.y >= phase.y + phase.h - 2 ? box.y - (phase.y + phase.h) : phase.y - (box.y + box.height)
      expect(gap, 'distancia del menú al botón de fase').toBeLessThanOrEqual(8)
      const items = menu.getByRole('menuitem')
      expect((await items.allTextContents()).at(-1), 'la última: terminar el turno').toBe('Terminar el turno')
      expect(await items.count(), 'sólo las fases elegibles').toBeLessThanOrEqual(3)
      await expect(menu.locator('[aria-disabled="true"], [disabled]'), 'ninguna opción apagada: sólo adónde se puede ir').toHaveCount(0)
      // Con poll: el menú entra con una animación de escala.
      await expect.poll(async () => Math.min(...(await items.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))), { message: 'alto de cada opción del menú de fases' }).toBeGreaterThanOrEqual(44)
      await expect(page.getByRole('menu'), 'no hay ninguna otra lista de fases en pantalla').toHaveCount(1)
      await expect(page.getByRole('tablist')).toHaveCount(0)
      expect(await roundCorners(page), 'con las fases abiertas').toEqual([])
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    })

    await test.step('F-01 / V-01: terminar el turno desde el botón de fase enciende la chapa del rival (borde de 3 px) y apaga la tuya', async () => {
      // El observador: todo texto de fase o de turno a la vista dentro de la mesa (fuera de las chapas y de los pasos), el pulso del botón de fase y los anuncios ocultos (`role="status"`).
      await page.evaluate(`(() => {
        const seen = { texts: [], pulses: 0, status: [] }
        window.__phase = seen
        const pulses = new Set()
        const tick = () => {
          for (const node of document.querySelectorAll('[data-fx="phase-pulse"]')) if (!pulses.has(node)) { pulses.add(node); seen.pulses += 1 }
          for (const node of document.querySelectorAll('[aria-label="Mesa de práctica"] *')) {
            if (node.children.length || node.closest('.sr-only, [data-life-badge], [role=status], ol, li')) continue
            const text = node.textContent.trim()
            if (/^(Turno de |Tu turno|Empezó tu turno|.*· (Draw|Standby|Main|Battle|End) Phase)/.test(text) && node.getBoundingClientRect().width && !seen.texts.includes(text)) seen.texts.push(text)
          }
          for (const node of document.querySelectorAll('[role=status].sr-only')) if (node.textContent.trim() && !seen.status.includes(node.textContent.trim())) seen.status.push(node.textContent.trim())
          requestAnimationFrame(tick)
        }
        tick()
      })()`)
      await press(phaseButton(page), isMobile)
      await press(page.getByRole('menu', { name: 'Elegí la fase a la que pasás' }).getByRole('menuitem', { name: 'Terminar el turno' }), isMobile)
      await expect.poll(() => page.locator('[data-life-badge][data-lp=theirs]').evaluate((node) => getComputedStyle(node).borderTopWidth), { timeout: 60_000, message: 'la chapa del rival en su turno' }).toBe('3px')
      expect(await page.locator('[data-life-badge][data-lp=mine]').evaluate((node) => getComputedStyle(node).borderTopWidth), 'tu chapa en el turno del rival').not.toBe('3px')
      // Cada dato una vez: la fase vive sólo en su botón y el turno lo dice la chapa; el cambio se nota con un pulso y se anuncia en un `role="status"` oculto.
      await expect.poll(() => page.evaluate(() => (window as unknown as { __phase: { pulses: number } }).__phase.pulses), { message: 'el pulso del botón de fase al cambiar de fase' }).toBeGreaterThan(0)
      const phaseSeen = (await page.evaluate(() => (window as unknown as { __phase: unknown }).__phase)) as { texts: string[]; pulses: number; status: string[] }
      expect(phaseSeen.texts, 'ningún cartel escribe la fase ni de quién es el turno').toEqual([])
      expect(phaseSeen.status.length, 'el anuncio de la fase va en un role="status" oculto a la vista').toBeGreaterThan(0)
    })

    expectStill(await readYs(page), 'en todo el turno: la ficha, la casilla, la placa, la cadena, el visor, las fases y el turno del rival')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
    expect(errors, 'errores de página propios').toEqual([])
  })

  // V-04 (escritorio): los dos paneles de antes, el ⚙ al pie y el campo sin scroll.
  test('V-04, escritorio: el detalle de la carta a la izquierda y los pasos a la derecha (sin pestañas), la casilla de ≥ 96 px, las vidas en sus esquinas y ⚙ de 44 px abajo a la derecha', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sólo escritorio (1440×900)')
    test.setTimeout(180_000)
    await startAuto(page)
    await watchYs(page)
    expect((await page.locator('aside').first().boundingBox())!.width, 'el menú lateral en la mesa se pliega al riel').toBe(76)
    const field = (await boxOf(page, '[aria-label="Campo"]'))!
    const dock = (await boxOf(page, '[data-card-dock]'))!
    const phase = (await boxOf(page, PHASE))!
    expect(dock.x + dock.w, 'el detalle de la carta queda a la izquierda de la columna del campo').toBeLessThanOrEqual(phase.x)
    await expect(page.getByRole('tablist', { name: 'Panel de la mesa' }), 'sin pestañas «Carta · Cadena · Pasos»').toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Carta' })).toHaveCount(0)
    const steps = (await page.locator('button, [role=tab]').filter({ hasText: /^Pasos/ }).first().boundingBox())!
    expect(steps.x, 'los pasos, a la derecha de la columna del campo').toBeGreaterThanOrEqual(phase.x + phase.w)
    expect(await mat(page).locator('[data-drop="mz:0"]').first().evaluate((node) => (node as HTMLElement).offsetWidth), 'ancho de la casilla a 1440×900').toBeGreaterThanOrEqual(96)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 'scroll vertical del documento').toBeLessThanOrEqual(0)
    const mine = (await boxOf(page, '[data-life-badge][data-lp=mine]'))!
    const theirs = (await boxOf(page, '[data-life-badge][data-lp=theirs]'))!
    expect(theirs.cy, 'las vidas del rival arriba').toBeLessThan(field.y + field.h / 2)
    expect(mine.cy, 'tus vidas abajo').toBeGreaterThan(field.y + field.h / 2)
    expect(mine.cx, 'las tuyas, a la izquierda de la columna').toBeLessThan(theirs.cx)
    const gear = (await boxOf(page, '[data-mat-gear]'))!
    expect(Math.min(gear.w, gear.h), 'el ⚙ mide 44 px').toBeGreaterThanOrEqual(43.5)
    expect(gear.cy, '⚙ abajo').toBeGreaterThan(field.y + field.h * 0.75)
    await expect(page.locator('[data-mat-dock]'), 'sin el dock de cuatro fichas').toHaveCount(0)
    expectStill(await readYs(page), 'en reposo, con la mesa de escritorio')
  })

  // (a) El campo no se mueve nunca, tampoco en x: abrir y cerrar el visor del Cementerio en escritorio no corre el botón de fase (antes, 22 px a la izquierda y no volvía).
  test('escritorio: abrir el Cementerio no corre el campo en x (la del botón de fase y la de las chapas quedan igual, también al cerrar el visor)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sólo escritorio (1440×900)')
    test.setTimeout(180_000)
    await startAuto(page)
    const before = (await boxOf(page, PHASE))!
    const mineBefore = (await boxOf(page, '[data-life-badge][data-lp=mine]'))!
    await press(handList(page).getByRole('listitem', { name: 'Ookazi', exact: true }).first(), isMobile)
    await press(page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Activar', exact: true }), isMobile)
    await press(mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]').nth(2), isMobile)
    await expect(page.locator('[data-drop="gy"]').first()).toHaveAccessibleName('GY: 1', { timeout: 30_000 })
    await press(page.locator('[data-drop="gy"]').first(), isMobile)
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(Math.abs((await boxOf(page, PHASE))!.cx - before.cx), 'el botón de fase con el visor abierto').toBeLessThanOrEqual(1)
    expect(Math.abs((await boxOf(page, '[data-life-badge][data-lp=mine]'))!.x - mineBefore.x), 'tu chapa con el visor abierto').toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(Math.abs((await boxOf(page, PHASE))!.cx - before.cx), 'el botón de fase con el visor cerrado').toBeLessThanOrEqual(1)
    expect(Math.abs((await boxOf(page, '[data-life-badge][data-lp=mine]'))!.x - mineBefore.x), 'tu chapa con el visor cerrado').toBeLessThanOrEqual(1)
  })

  // (h) M-10: Opciones es una hoja recta de abajo en el celular y una ventana recta en escritorio, con «Vista 3D» y «Menús flotantes» arriba y «Rendirse» al final; abrirla no mueve el campo.
  test('M-10, Opciones: hoja recta de abajo (celular) o ventana recta (escritorio), «Vista 3D» y «Menús flotantes» arriba, «Rendirse» al final con confirmación, y el campo no se mueve', async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    await startAuto(page)
    await watchYs(page)
    const phaseBefore = (await boxOf(page, PHASE))!
    const gear = page.locator('[data-mat-gear]')
    expect(Math.min(...(await gear.evaluate((node) => [node.getBoundingClientRect().width, node.getBoundingClientRect().height]))), 'el ⚙ mide 44 px').toBeGreaterThanOrEqual(43.5)
    await press(gear, isMobile)
    const options = page.locator('[data-auto-panel]').filter({ hasText: 'Vista 3D' })
    await expect(options).toBeVisible()
    await expect(page.locator('[data-mat-dock]'), 'sin el dock de cuatro fichas').toHaveCount(0)
    const viewport = page.viewportSize()!
    await expect.poll(async () => (await options.boundingBox())!.y + (await options.boundingBox())!.height, { message: 'la hoja/ventana entra y se asienta' }).toBeGreaterThan(viewport.height - 2)
    const box = (await options.boundingBox())!
    if (isMobile) {
      expect(box.x, 'la hoja de abajo, de borde a borde').toBeLessThanOrEqual(0.5)
      expect(box.width, 'la hoja de abajo, de borde a borde').toBeGreaterThanOrEqual(viewport.width - 0.5)
      await expect(options).toHaveAttribute('data-auto-panel', 'docked')
    } else {
      expect(box.width, 'la ventana de escritorio, de ≤ 480 px').toBeLessThanOrEqual(482)
      await expect(options).toHaveAttribute('data-auto-panel', 'floating')
    }
    expect(await roundCorners(page), 'Opciones: esquinas rectas').toEqual([])
    // El orden: «Vista 3D» y «Menús flotantes» primero, «Rendirse» último.
    const text = await options.innerText()
    expect(text.indexOf('Vista 3D'), '«Vista 3D» antes que «Menús flotantes»').toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Menús flotantes')).toBeGreaterThan(text.indexOf('Vista 3D'))
    expect(text.indexOf('Menús flotantes')).toBeLessThan(text.indexOf('Reiniciar el mismo duelo'))
    await expect(options.getByRole('switch', { name: 'Vista 3D' })).toBeVisible()
    await expect(options.getByRole('switch', { name: 'Menús flotantes' })).toBeVisible()
    const rendirse = options.getByRole('button', { name: 'Rendirse', exact: true })
    expect(await options.getByRole('button').last().innerText(), '«Rendirse» al final').toContain('Rendirse')
    await rendirse.scrollIntoViewIfNeeded()
    for (const name of ['Rendirse', 'Guardar replay', 'Reiniciar el mismo duelo']) expect((await options.getByRole('button', { name }).boundingBox())!.height, `alto de «${name}»`).toBeGreaterThanOrEqual(44)
    expect(Math.abs((await boxOf(page, PHASE))!.cx - phaseBefore.cx), 'el botón de fase con Opciones abierta').toBeLessThanOrEqual(1)
    // Rendirse pide confirmar (recta, con los botones de un renglón) y «Seguir jugando» no termina el duelo.
    await press(rendirse, isMobile)
    const confirm = page.getByRole('alertdialog', { name: '¿Rendirte en este duelo?' })
    await expect(confirm).toBeVisible()
    // Con poll: el diálogo entra con una animación de escala. En escritorio los botones de la confirmación miden 32 px (dato de TI-199, no se afirma).
    if (isMobile) await expect.poll(async () => Math.min(...(await confirm.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))), { message: 'alto de los botones de la confirmación' }).toBeGreaterThanOrEqual(44)
    expect(await roundCorners(page), 'con la confirmación de Rendirse').toEqual([])
    expect(await confirm.evaluate((node) => [node, ...Array.from(node.querySelectorAll('*'))].filter((child) => parseFloat(getComputedStyle(child).borderTopLeftRadius) !== 0).length), 'la confirmación, sin esquinas redondas').toBe(0)
    await press(confirm.getByRole('button', { name: 'Seguir jugando' }), isMobile)
    await expect(confirm).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(options).toHaveCount(0)
    expect(Math.abs((await boxOf(page, PHASE))!.cx - phaseBefore.cx), 'el botón de fase con Opciones cerrada').toBeLessThanOrEqual(1)
    expectStill(await readYs(page), 'al abrir y cerrar Opciones y su confirmación')
  })
})

// M-02 / M-07 / M-08 con una respuesta real: el deck son Foolish Burial y Ash Blossom, y tu Ash puede responder a tu Foolish (el rival lleva sólo un Effect Veiler: no responde a una Mágica).
const ASH = { cardType: 'Effect Monster', frameType: 'effect', race: 'Zombie', attribute: 'FIRE', level: 3, atk: '1700', def: '0' }
const respondDeck = stateOf([...Array.from({ length: 20 }, () => card(81439173, 'Foolish Burial', SPELL)), ...Array.from({ length: 20 }, () => card(14558127, 'Ash Blossom & Joyous Spring', ASH))])

test.describe('M-02 / M-07 / M-08, responder (donde están el núcleo y /auto-data)', () => {
  test.skip(({ baseURL }) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(baseURL ?? ''), 'necesita /auto-data/* y el núcleo: no están en un preview local')

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(SEEDED)
    await context.addInitScript(() => {
      if (!localStorage.getItem('ygo-lab:rival-handtraps:v2')) localStorage.setItem('ygo-lab:rival-handtraps:v2', JSON.stringify({ enabled: true, picks: [{ id: 97268402, name: 'Effect Veiler', copies: 3 }], hand: 1 }))
    })
    await prepare(context, true, respondDeck)
  })

  test('el cartel de responder trae la carta elegida y «Activar» prendido (aun con copias agrupadas), la principal a la derecha, sin «Preguntarme» ni «CL»; minimizado queda una tira con la pregunta; y la cadena sigue', async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    await startAuto(page)
    await watchYs(page)
    await press(handList(page).getByRole('listitem', { name: 'Foolish Burial', exact: true }).first(), isMobile)
    await press(page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Activar', exact: true }), isMobile)
    const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
    await expect(zones.first()).toBeVisible()
    await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)

    const ask = page.locator('[data-auto-panel]').filter({ hasText: '¿Respondés?' })
    await expect(ask, 'M-02: qué pasó y qué se pide, en una frase').toBeVisible({ timeout: 30_000 })
    await expect(ask).toContainText('Se activó «Foolish Burial». ¿Respondés?')
    await expect(ask.getByText(/×\d/), 'las copias iguales van en un solo grupo').toBeVisible()
    const pass = ask.getByRole('button', { name: 'Pasar', exact: true })
    const activate = ask.getByRole('button', { name: 'Activar', exact: true })
    await expect(activate, 'con una sola opción (un grupo de copias) viene elegida y «Activar» prendido').toBeEnabled()
    await expect(ask.getByRole('option').first(), 'el grupo viene elegido').toHaveAttribute('aria-selected', 'true')
    expect((await activate.boundingBox())!.x, '«Activar» a la derecha de «Pasar»').toBeGreaterThan((await pass.boundingBox())!.x)
    expect(await ask.innerText(), 'ni «Preguntarme» ni «CL» en el cartel').not.toMatch(/Preguntarme|\bCL\d/)
    await expect(page.locator('[data-prompt-turn], [data-panel-fold]')).toHaveCount(0)
    if (isMobile) {
      const option = (await ask.getByRole('option').first().boundingBox())!
      expect(Math.abs(option.x + option.width / 2 - page.viewportSize()!.width / 2), 'la carta, centrada en la bandeja').toBeLessThanOrEqual(2)
    }
    expect(await roundCorners(page), 'con el cartel de responder').toEqual([])

    // M-07: minimizado queda una tira con la pregunta (en un renglón; si no entra, se corta el nombre de la carta y nunca la pregunta) y tocarla la sube.
    await press(ask.getByRole('button', { name: /^Minimizar/ }), isMobile)
    const strip = page.locator('[data-auto-panel]').filter({ has: page.getByRole('button', { name: 'Mostrar la pregunta' }) })
    await expect(strip).toBeVisible()
    await expect(strip).toContainText('¿Respondés a «')
    await expect(strip).toContainText('»?')
    if (isMobile) expect((await strip.boundingBox())!.height, 'la tira minimizada (≤ 56 px)').toBeLessThanOrEqual(56)
    const cut = await strip.evaluate((node) => Array.from(node.querySelectorAll('*')).filter((child) => child.children.length === 0 && child.scrollWidth > child.clientWidth + 1).map((child) => child.textContent!.trim()))
    for (const text of cut) expect(text, 'lo que se corta es el nombre de la carta, no la pregunta').not.toMatch(/Respondés|»\?/)
    await press(strip.getByRole('button', { name: 'Mostrar la pregunta' }), isMobile)
    await expect(ask, 'tocar la tira sube la pregunta').toBeVisible()

    // Responder: la cadena de dos (tu Ash niega tu Foolish) se arma y se resuelve del último al primero.
    await press(activate, isMobile)
    await expect(page.locator('[data-chain-card="2"]'), 'el segundo eslabón entra').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-chain-stage]')).toHaveCount(0, { timeout: 30_000 })
    await expect(phaseButton(page)).toBeEnabled({ timeout: 30_000 })
    expectStill(await readYs(page), 'al responder, minimizar y la cadena')
  })
})

// V-02 (M-03, elegir varias): la muestra de /playground (la misma hoja de CardPicker que usa el duelo; un efecto real que pida varias cartas en el deck de la prueba no se arma de forma estable).
test.describe('V-02, elegir varias (muestra de /playground)', () => {
  test.beforeEach(async ({ context }) => prepare(context, true))

  test('un solo cartel con las copias agrupadas («×N»), el orden numerado, el contador «N de M» y una sola principal a la derecha que se prende al completar', async ({ page, isMobile }) => {
    // /playground monta cientos de muestras y la traza que Playwright toma en cada toque tumba el renderizador del celular de la prueba (×3, con toque): en celular se midió por script (390×844, con toque).
    test.skip(isMobile, 'sólo escritorio: con la traza, el celular (×3) tumba la página de /playground')
    await page.goto('/playground')
    // La muestra «Elegir varias · copias juntas»: su botón «Abrir la hoja» es el primero que le sigue al título.
    const title = page.locator('h3', { hasText: 'Elegir varias · copias juntas' })
    await expect(title, '/playground monta todas sus muestras (en un dev server tarda)').toBeAttached({ timeout: 50_000 })
    await title.scrollIntoViewIfNeeded()
    await press(title.locator('xpath=following::button[normalize-space()="Abrir la hoja"][1]'), isMobile)
    const sheet = page.locator('[data-prompt]').filter({ hasText: 'Branded Fusion' }).first()
    await expect(sheet).toBeVisible()
    const groups = sheet.locator('[role=option]').filter({ hasText: /×\d/ })
    await expect(groups, 'las copias iguales van en un solo grupo cada una').toHaveCount(2)
    await expect(sheet).toContainText('0 de 3')

    const primary = sheet.getByRole('button').last()
    await expect(primary, 'la principal está apagada hasta completar').toBeDisabled()
    expect((await primary.boundingBox())!.x, 'la principal, a la derecha de «Cancelar»').toBeGreaterThan((await sheet.getByRole('button', { name: 'Cancelar' }).boundingBox())!.x)
    expect((await primary.boundingBox())!.height, 'alto de la principal').toBeGreaterThanOrEqual(44)
    // Cada toque suma la próxima copia del grupo y lleva su número de orden: 1, 1·2, 1·2·3.
    for (const [counter, order] of [['1 de 3', '1'], ['2 de 3', '1·2'], ['3 de 3', '1·2·3']] as const) {
      await press(groups.first(), isMobile)
      await expect(sheet).toContainText(counter)
      await expect(groups.first()).toContainText(order)

    }
    await expect(primary, 'completo: la principal se prende').toBeEnabled()
    // Lleno, tocar el grupo suelta la última.
    await press(groups.first(), isMobile)
    await expect(sheet).toContainText('2 de 3')
    await expect(primary).toBeDisabled()
    await expect(sheet, 'sin cabecera de fase ni de turno').not.toContainText(MENU_OWN)
  })
})
