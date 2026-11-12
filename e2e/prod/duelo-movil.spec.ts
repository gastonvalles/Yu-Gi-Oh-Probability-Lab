// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): la mesa del duelo con el kit aprobado (TI-190 a TI-198; QA del conjunto, TI-199) y la práctica manual, en celular (390×844, con toque) y en escritorio (1440×900).
// Ronda `fase-duelo-4` (TI-205 a TI-208; QA del conjunto, TI-209): la cadena en grande sólo al encadenar y los medallones al resolver, los botones de los menús pegados abajo y sin «Ver carta» (la miniatura se toca), las letras blancas sobre el
// color del tipo (contraste ≥ 4,5:1), la banda de fases del color de quien juega y el cartel de resultado nuevo (una sola principal abajo, esquinas rectas).
// Ronda `fase-duelo-5` (TI-214 a TI-225; QA del conjunto, TI-226): las pilas sólo número y el botón de fase cuadrado con el menú de las seis fases (también en el automático), «Colores» Carbón | Índigo en ⚙, sin «⋯» en Solo y Online, deshacer abajo
// en el celular, el aviso de arriba que se desliza, «Cambio de turno» al pasar el turno, la palabra del resultado enorme sobre el campo (la hoja no la repite) y el botón principal de los menús en lima.
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
    // Con hash en el sitio publicado; sin él en un dev server.
    expect([...avifs][0]).toMatch(isMobile ? /^remolino-medio-movil(-.*)?\.avif$/ : /^remolino-medio-escritorio(-.*)?\.avif$/)
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

/** El contraste (WCAG) entre el color del texto de `locator` y el de su fondo. */
const contrastOf = (locator: Locator) =>
  locator.evaluate((node) => {
    const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((value) => {
        const unit = value / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const style = getComputedStyle(node)
    const [hi, lo] = [luminance(channels(style.color)), luminance(channels(style.backgroundColor))].sort((a, b) => b - a)
    return (hi! + 0.05) / (lo! + 0.05)
  })

/** TI-206: los botones de acción son el borde de abajo del menú: ninguno dentro de un contenedor que se desplaza y a no más que su relleno del borde (≤ 32 px; en la hoja acoplada, 0). */
const actionsAtBottom = (panel: Locator) =>
  panel.evaluate((root) => {
    const buttons = Array.from(root.querySelectorAll('[role=menu] button'))
    if (!buttons.length) return false
    const inScroller = buttons.some((button) => {
      for (let node = button.parentElement; node && node !== root; node = node.parentElement) if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return true
      return false
    })
    const gap = root.getBoundingClientRect().bottom - Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom))
    return !inScroller && gap >= -0.5 && gap <= 32
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
      return { text: node.textContent!.trim(), w: b.width, h: b.height, right: b.right, oneLine: node.scrollHeight <= node.clientHeight + 1, bg: getComputedStyle(node).backgroundColor, fg: getComputedStyle(node).color }
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
  // TI-225: la principal de los menús del duelo es lima con letras oscuras (la barra de la ventana queda en violeta: no compiten).
  const lima = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.backgroundColor = 'var(--color-info)'; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color })
  expect(buttons.at(-1)!.bg, `${what}: la principal es lima`).toBe(lima)
  expect(buttons.at(-1)!.fg, `${what}: letras oscuras sobre el lima`).not.toBe('rgb(253, 255, 255)')
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
      // TI-206: no existe «Ver carta» (ni botón ni fila); los botones son el borde de abajo del menú; el chip del tipo lleva letra blanca con ≥ 4,5:1 y no repite el dato.
      await expect(sheet.getByText('Ver carta', { exact: true }), 'sin «Ver carta» visible').toHaveCount(0)
      await expect(sheet.getByRole('menuitem', { name: /Ver carta/ }), 'sin «Ver carta» entre las jugadas').toHaveCount(0)
      expect(await contrastOf(sheet.locator('[data-type-chip]').first()), 'contraste de la letra del chip del tipo sobre su fondo').toBeGreaterThanOrEqual(4.5)
      expect(await sheet.locator('[data-type-chip]').first().evaluate((node) => getComputedStyle(node).color), 'la letra del chip es blanca').toMatch(/^rgb\(25[0-5], 25[0-5], 25[0-5]\)$/)
      await expect(sheet.locator('[data-type-chip]').first(), 'el chip dice «Normal»').toHaveText('Normal')
      expect(((await sheet.locator('[data-type-chip]').first().locator('xpath=../..').innerText()).match(/\bNormal\b/g) ?? []).length, 'el tipo se dice una sola vez en la cabeza').toBe(1)
      expect(await actionsAtBottom(sheet), 'los botones son el borde de abajo del menú: fuera de lo que se desplaza y a no más que su relleno del borde').toBe(true)
      if (isMobile) {
        expect(await alphaOf(sheet), 'alfa del fondo de la ficha').toBe(1)
        await expect(sheet.getByRole('button', { name: /^Minimizar/ })).toBeVisible()
        // La miniatura de la cabeza es el botón que abre la carta en grande (≥ 44 px, con su nombre accesible), y cerrar el visor deja la ficha.
        const thumb = sheet.getByRole('button', { name: 'Ver carta', exact: true })
        const thumbBox = (await thumb.boundingBox())!
        expect(Math.min(thumbBox.width, thumbBox.height), 'la miniatura se toca con el dedo (≥ 44 px)').toBeGreaterThanOrEqual(43.5)
        await press(thumb, isMobile)
        const detail = page.getByRole('dialog', { name: `Detalle de ${name}` })
        await expect(detail, 'tocar la miniatura abre la carta en grande').toBeVisible()
        await page.keyboard.press('Escape')
        await expect(detail, 'Escape cierra el visor').toHaveCount(0)
        // El visor reemplaza a la ficha (nunca dos hojas) y al cerrarlo se vuelve a la ficha, para seguir con la Invocación Normal.
        await expect(sheet, 'cerrar el visor vuelve a la ficha').toBeVisible()
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

    await test.step('M-02 / K-01 / F-05 / TI-205: una Mágica que nadie responde dice «Activar» y entra igual como una carta grande inclinada, con su «1»; al resolver la escena se va y queda el medallón «1»; las vidas del rival bajan contando dentro de su chapa', async () => {
      // El observador: la escena de la cadena (carta, pose, inclinación), los carteles de «Activar» y todo número de daño fuera de una chapa.
      await page.evaluate(`(() => {
        const seen = { stage: [], status: [], spot: 0, outside: [], life: [], t0: 0, medals: [], overlap: 0, armed: 0, statusW: 99 }
        window.__k = seen
        const side = () => document.querySelector('[data-life-badge][data-lp=theirs] .text-stat, [data-life-badge][data-lp=theirs] .text-lead')?.textContent ?? ''
        const tick = () => {
          const now = performance.now()
          // La escena que se está yendo (data-leaving, un fundido corto) ya no cuenta: es el momento de resolver.
          const stage = document.querySelector('[data-chain-stage]:not([data-leaving])')
          // Armando (escena a la vista) no hay ningún medallón: duplicarían a las cartas.
          if (stage && document.querySelector('[data-chain-medal]')) seen.armed += 1
          // Al resolver, la escena ya se fue y quedan los medallones (uno por eslabón); si hay escena y un medallón resolviéndose a la vez, se superponen.
          for (const medal of document.querySelectorAll('[data-chain-medal]')) {
            if (!stage && !seen.medals.includes(medal.dataset.chainMedal)) seen.medals.push(medal.dataset.chainMedal)
            if (stage && 'resolving' in medal.dataset) seen.overlap += 1
          }
          if (stage) {
            for (const card of stage.querySelectorAll('[data-chain-card]')) seen.stage.push({ n: card.dataset.chainCard, pose: card.dataset.pose, rotate: getComputedStyle(card).rotate, t: now, w: card.offsetWidth, layer: stage.offsetWidth, label: card.getAttribute('aria-label') })
            const status = stage.querySelector('[role=status]')
            if (status && !seen.status.includes(status.textContent)) seen.status.push(status.textContent)
            if (status) seen.statusW = Math.min(seen.statusW, status.getBoundingClientRect().width)
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
        medals: string[]
        overlap: number
        armed: number
        statusW: number
      }
      const cards = new Set(k.stage.map((frame) => frame.n))
      expect([...cards], 'una activación sola: un solo eslabón, el 1').toEqual(['1'])
      // TI-205: la escena en grande es sólo del momento de encadenar. Al resolver se va entera (nunca una carta grande con un efecto resolviéndose) y queda el medallón del eslabón.
      expect(k.medals, 'al resolver queda el medallón «1» (ya no la insignia «CL1»)').toEqual(['1'])
      expect(k.overlap, 'ningún medallón «resolviendo» con la escena en grande a la vez').toBe(0)
      expect(k.armed, 'armando no hay medallones: duplicarían a las cartas de la escena').toBe(0)
      expect(k.statusW, 'la línea «Se resuelve del último al primero» no se ve (va oculta, para el lector de pantalla)').toBeLessThanOrEqual(2)
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
      // El último cuadro muestreado puede caer a uno del 7200 (7201): se afirma que llegó a 7200 y el tiempo hasta el último cuadro.
      expect(counted.at(-1) === '7200' || counted.at(-1) === '7201', `el número termina en 7200 (último: ${counted.at(-1)})`).toBe(true)
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

    await test.step('TI-214 / M-04: el menú de fases (el del manual) muestra las SEIS fases, la de ahora marcada y las que no se pueden apagadas, «End» termina el turno; se abre pegado al botón; no hay otra lista de fases; Escape lo cierra', async () => {
      const phase = (await boxOf(page, PHASE))!
      await press(phaseButton(page), isMobile)
      const menu = page.getByRole('menu', { name: 'Pasar a la fase' })
      await expect(menu).toBeVisible()
      const box = (await menu.boundingBox())!
      const gap = box.y >= phase.y + phase.h - 2 ? box.y - (phase.y + phase.h) : phase.y - (box.y + box.height)
      // El menú es el del manual (`PhaseRow`): se ancla con su propio hueco (≈ 15,6 px medidos en la rama integrada; antes, ≤ 8 px).
      expect(gap, 'distancia del menú al botón de fase').toBeLessThanOrEqual(20)
      const items = menu.getByRole('menuitem')
      await expect(items, 'las seis fases').toHaveCount(6)
      expect(await items.evaluateAll((nodes) => nodes.map((node) => node.querySelector('span[aria-hidden] + span')?.textContent)), 'en orden: Draw, Standby, Main 1, Battle, Main 2, End').toEqual(['Draw', 'Standby', 'Main 1', 'Battle', 'Main 2', 'End'])
      await expect(menu.locator('[aria-current="true"]'), 'la fase de ahora, marcada (Main 1)').toHaveCount(1)
      await expect(menu.locator('[aria-current="true"]')).toHaveAccessibleName('Fase actual: Main Phase 1')
      await expect(menu.locator('[aria-disabled="true"]'), 'las que no se pueden, apagadas (Draw, Standby, Battle, Main 2)').toHaveCount(4)
      await expect(items.last(), 'End se puede: termina el turno').toHaveAccessibleName('Ir a End Phase')
      // Con poll: el menú entra con una animación de escala.
      await expect.poll(async () => Math.min(...(await items.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))), { message: 'alto de cada opción del menú de fases' }).toBeGreaterThanOrEqual(44)
      await expect(page.getByRole('menu'), 'no hay ninguna otra lista de fases en pantalla').toHaveCount(1)
      await expect(page.getByRole('tablist')).toHaveCount(0)
      expect(await roundCorners(page), 'con las fases abiertas').toEqual([])
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    })

    await test.step('F-01 / V-01: terminar el turno desde el botón de fase enciende la chapa del rival (borde de 3 px) y apaga la tuya', async () => {
      // El observador: todo texto de fase o de turno a la vista dentro de la mesa (fuera de la banda, las chapas y los pasos), cada banda de fase (TI-208: lado, texto, si ataja toques, el fondo, la fila que ocupa) y los anuncios ocultos (`role="status"`).
      await page.evaluate(`(() => {
        const seen = { texts: [], bands: [], status: [] }
        window.__phase = seen
        const tick = () => {
          for (const band of document.querySelectorAll('[data-fx="banner"]')) {
            const id = band.dataset.side + '|' + band.textContent
            if (seen.bands.some((entry) => entry.id === id)) continue
            const box = band.getBoundingClientRect()
            const button = document.querySelector('button[aria-label^="Fases: "]').getBoundingClientRect()
            seen.bands.push({ id, side: band.dataset.side, turn: band.hasAttribute('data-turn'), text: band.textContent, pe: getComputedStyle(band).pointerEvents, hidden: band.getAttribute('aria-hidden'), image: getComputedStyle(band.firstElementChild).backgroundImage, color: getComputedStyle(band.firstElementChild).color, mid: Math.abs(box.top + box.height / 2 - (button.top + button.height / 2)), height: box.height })
          }
          for (const node of document.querySelectorAll('[aria-label="Mesa de práctica"] *')) {
            if (node.children.length || node.closest('.sr-only, [data-life-badge], [data-fx=banner], [role=status], ol, li')) continue
            const text = node.textContent.trim()
            if (/^(Turno de |Tu turno|Empezó tu turno|.*· (Draw|Standby|Main|Battle|End) Phase)/.test(text) && node.getBoundingClientRect().width && !seen.texts.includes(text)) seen.texts.push(text)
          }
          for (const node of document.querySelectorAll('[role=status].sr-only')) if (node.textContent.trim() && !seen.status.includes(node.textContent.trim())) seen.status.push(node.textContent.trim())
          requestAnimationFrame(tick)
        }
        tick()
      })()`)
      await press(phaseButton(page), isMobile)
      await press(page.getByRole('menu', { name: 'Pasar a la fase' }).getByRole('menuitem', { name: 'Ir a End Phase' }), isMobile)
      // En el celular, End pregunta si se termina el turno (no hay «Pasar turno»).
      const endConfirm = page.getByRole('alertdialog').getByRole('button', { name: 'Terminar turno' })
      if (await endConfirm.waitFor({ timeout: 2000 }).then(() => true, () => false)) await press(endConfirm, isMobile)
      await expect.poll(() => page.locator('[data-life-badge][data-lp=theirs]').evaluate((node) => getComputedStyle(node).borderTopWidth), { timeout: 60_000, message: 'la chapa del rival en su turno' }).toBe('3px')
      expect(await page.locator('[data-life-badge][data-lp=mine]').evaluate((node) => getComputedStyle(node).borderTopWidth), 'tu chapa en el turno del rival').not.toBe('3px')
      // TI-208: la fase se anuncia con una banda que cruza el campo por la fila del botón de fase, del color de quien juega (la tuya violeta, la del rival lima), sólo con el nombre de la fase, sin atajar toques; el turno lo dice
      // el color y la chapa (ningún otro texto escribe la fase ni «Turno de…»), y se anuncia además en un `role="status"` oculto.
      await expect.poll(() => page.evaluate(() => (window as unknown as { __phase: { bands: { side: string }[] } }).__phase.bands.filter((band) => band.side === 'theirs').length), { message: 'la banda de fase del rival' }).toBeGreaterThan(0)
      const phaseSeen = (await page.evaluate(() => (window as unknown as { __phase: unknown }).__phase)) as { texts: string[]; bands: { side: string; turn: boolean; text: string; pe: string; hidden: string | null; image: string; color: string; mid: number; height: number }[]; status: string[] }
      expect(phaseSeen.texts, 'ningún texto suelto escribe la fase ni de quién es el turno').toEqual([])
      const colorOf = (token: string) =>
        page.evaluate((name) => {
          const probe = document.createElement('i')
          probe.style.backgroundColor = `var(${name})`
          document.body.append(probe)
          const color = getComputedStyle(probe).backgroundColor
          probe.remove()
          return color
        }, token)
      const lime = await colorOf('--color-info')
      const violet = await colorOf('--color-primary')
      // TI-223: al pasar el turno cruza antes «Cambio de turno» (más alta que la de fase, del color de quien empieza a jugar: lima si pasa al rival), decorativa y sin atajar toques.
      const turnBands = phaseSeen.bands.filter((band) => band.turn)
      expect(turnBands.map((band) => `${band.side}:${band.text}`), 'al pasar el turno al rival sale su «Cambio de turno»').toContain('theirs:Cambio de turno')
      const phaseOnly = phaseSeen.bands.filter((band) => !band.turn)
      for (const band of turnBands) {
        expect(band.pe, 'la banda del turno no ataja toques').toBe('none')
        expect(band.hidden, 'la banda del turno es decorativa').toBe('true')
        expect(band.height, 'la banda del turno es más alta que la de fase').toBeGreaterThan(Math.max(...phaseOnly.map((other) => other.height)) + 4)
      }
      for (const band of phaseOnly) {
        expect(band.text, `la banda dice sólo el nombre de la fase («${band.text}»)`).toMatch(/^(Draw|Standby|Battle|End) Phase$|^Main Phase [12]$/)
        expect(band.pe, 'la banda no ataja toques').toBe('none')
        expect(band.hidden, 'la banda es decorativa: el anuncio va en el role="status" oculto').toBe('true')
        expect(band.mid, 'la banda cruza por la fila del botón de fase').toBeLessThanOrEqual(2)
        expect(band.height, 'alto de la banda').toBeGreaterThanOrEqual(isMobile ? 44 : 56)
        expect(band.image, `la banda del lado «${band.side}» es del color de quien juega`).toContain(band.side === 'theirs' ? lime : violet)
      }
      expect(phaseOnly.find((band) => band.side === 'theirs')!.color, 'sobre el lima, texto oscuro').not.toBe('rgb(253, 255, 255)')
      expect(phaseSeen.status.length, 'el anuncio de la fase va en un role="status" oculto a la vista').toBeGreaterThan(0)
    })

    expectStill(await readYs(page), 'en todo el turno: la ficha, la casilla, la placa, la cadena, el visor, las fases y el turno del rival')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
    expect(errors, 'errores de página propios').toEqual([])
  })

  // Ronda `fase-duelo-5` (TI-214, TI-215, TI-220, TI-225): las pilas sólo número, el botón de fase cuadrado, sin «⋯» (un solo menú: ⚙), deshacer abajo en el celular, «Colores» con Índigo y el aviso de arriba que se desliza.
  test('ronda 5: pilas sólo número, botón de fase cuadrado, sin «⋯», deshacer abajo (celular), ⚙ con sus grupos y «Colores» Carbón | Índigo, y el aviso de arriba que se desliza sin mover el campo', async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    await startAuto(page)
    await watchYs(page)

    await test.step('TI-214: el conteo de cada pila es sólo un número blanco, sin cuadro ni color; el botón de fase es cuadrado (≥ 44 px)', async () => {
      const counts = await mat(page).locator('[data-drop="deck"], [data-drop="extra"], [data-drop="gy"], [data-drop="banish"]').evaluateAll((zones) =>
        zones.map((zone) => {
          const number = Array.from(zone.querySelectorAll('span')).find((span) => /^\d+$/.test(span.textContent!.trim()) && !span.children.length)
          if (!number) return null
          const style = getComputedStyle(number)
          const parent = getComputedStyle(number.parentElement!)
          return { color: style.color, bg: style.backgroundColor, parentBg: parent.backgroundColor, border: parent.borderTopWidth }
        }),
      )
      expect(counts.filter(Boolean).length, 'las pilas muestran su número').toBeGreaterThanOrEqual(3)
      for (const count of counts.filter(Boolean)) {
        expect(count!.color, 'el número, blanco').toBe('rgb(253, 255, 255)')
        expect([count!.bg, count!.parentBg], 'sin cuadro de color').toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
        expect(count!.border, 'sin borde').toBe('0px')
      }
      const sides = await phaseButton(page).evaluate((node) => [(node as HTMLElement).offsetWidth, (node as HTMLElement).offsetHeight])
      expect(Math.abs(sides[0]! - sides[1]!), `el botón de fase es cuadrado (${sides.join('×')})`).toBeLessThanOrEqual(1)
      expect(Math.min(...sides), 'el botón de fase mide ≥ 44 px').toBeGreaterThanOrEqual(44)
    })

    await test.step('TI-220: un solo menú de opciones (sin «⋯»), y deshacer abajo en el celular (arriba en escritorio, como siempre)', async () => {
      await expect(page.getByRole('button', { name: 'Más opciones' }), 'Solo no tiene «⋯»').toHaveCount(0)
      const undo = (await boxOf(page, 'button[aria-label="Deshacer"]'))!
      const field = (await boxOf(page, '[aria-label="Campo"]'))!
      if (isMobile) {
        expect(undo.y, 'deshacer abajo, en la botonera').toBeGreaterThan(field.y + field.h)
        expect(Math.min(undo.w, undo.h), 'deshacer mide 44 px').toBeGreaterThanOrEqual(43.5)
        const gear = (await boxOf(page, '[data-mat-gear]'))!
        expect(undo.x, 'deshacer, el primero de la derecha (antes de ≡ y ⚙)').toBeLessThan(gear.x)
        expect(Math.abs(undo.cy - gear.cy), 'en la misma fila que ⚙').toBeLessThanOrEqual(2)
        await expect(page.locator('[data-undo-chip], [data-testid="undo-chip"]'), 'sin el aviso «Deshacer» con miniatura').toHaveCount(0)
      } else expect(undo.y, 'en escritorio deshacer sigue arriba').toBeLessThan(field.y)
    })

    await test.step('TI-220 / TI-215: ⚙ Opciones con «La mesa» y «El duelo»; «Colores» cambia la paleta y se recuerda', async () => {
      await press(page.locator('[data-mat-gear]'), isMobile)
      const options = page.locator('[data-auto-panel]').filter({ hasText: 'Vista 3D' })
      await expect(options).toBeVisible()
      const text = await options.innerText()
      const order = ['LA MESA', 'Vista 3D', 'Sonidos', 'Colores', 'Menús flotantes', 'EL DUELO', 'Nueva mano', 'Guardar combo', 'Rendirse'].map((label) => text.indexOf(label))
      expect(order, 'los grupos y sus filas, en orden').toEqual([...order].sort((a, b) => a - b))
      expect(order.every((index) => index >= 0), `están todas las filas (${order.join(',')})`).toBe(true)
      expect((text.match(/Rival/g) ?? []).length, '«Rival» (el cambio de rival) una sola vez').toBeLessThanOrEqual(2)
      const group = options.getByRole('group', { name: 'Colores' })
      await expect(group.getByRole('button')).toHaveText(['Carbón', 'Índigo'])
      // Con el dedo (celular), 44 px; con el mouse, la variante de fichas de 32 px (pointer-coarse:h-11).
      if (isMobile) expect(Math.min(...(await group.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)))), 'los botones de colores miden 44 px').toBeGreaterThanOrEqual(43.5)
      await press(group.getByRole('button', { name: 'Índigo' }), isMobile)
      await expect(page.locator('html'), 'Índigo se aplica en <html>').toHaveAttribute('data-palette', 'indigo')
      expect(await page.evaluate(() => localStorage.getItem('ygo-lab:palette')), 'y se recuerda').toBe('indigo')
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim().toLowerCase()), 'los tokens de Índigo (fondo #150a24)').toBe('#150a24')
      await press(group.getByRole('button', { name: 'Carbón' }), isMobile)
      await expect(page.locator('html')).not.toHaveAttribute('data-palette', /./)
      await page.keyboard.press('Escape')
      await expect(options).toHaveCount(0)
    })

    if (isMobile) {
      await test.step('TI-220: el aviso de arriba (el momento) va debajo de la barra, sin tapar la chapa del rival, y se saca deslizándolo; el campo no se mueve', async () => {
        await press(handList(page).getByRole('listitem', { name: 'Gene-Warped Warwolf', exact: true }).first(), isMobile)
        await press(page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Invocación Normal', exact: true }), isMobile)
        const zones = mat(page).locator('[aria-label="Campo"] [aria-label$=": elegir"]')
        await expect(zones.first()).toBeVisible()
        await press(zones.nth(Math.min(2, (await zones.count()) - 1)), isMobile)
        const notice = page.locator('[data-swipe-away]').first()
        await expect(notice, 'el aviso del momento').toBeVisible({ timeout: 15_000 })
        const box = (await notice.boundingBox())!
        const rival = (await boxOf(page, '[data-lp=theirs]'))!
        const field = (await boxOf(page, '[aria-label="Campo"]'))!
        expect(box.y, 'debajo de la barra y de la chapa del rival').toBeGreaterThanOrEqual(rival.y + rival.h - 1)
        expect(box.y, 'arriba, sobre la mano del rival (antes del campo)').toBeLessThan(field.y)
        // El gesto: mientras se arrastra acompaña al dedo y al soltar se va (el momento dura 1,5 s: se arrastra enseguida).
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        for (let step = 1; step <= 8; step++) await page.mouse.move(box.x + box.width / 2 + step * 30, box.y + box.height / 2)
        expect(await notice.evaluate((node) => (node as HTMLElement).style.transform), 'acompaña al dedo').toMatch(/translateX\(2\d\dpx\)/)
        await page.mouse.up()
        await expect(page.locator('[data-swipe-away]'), 'al soltar, el aviso se saca').toHaveCount(0, { timeout: 3000 })
      })
    }

    expectStill(await readYs(page), 'con Opciones, el cambio de paleta y el aviso')
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

  // TI-207 / TI-223 / TI-230: el final del duelo. Rendirse no es un final por vidas: no hay golpe letal ni cuenta y el bloque sale ya. Sin hoja, sin velo y sin marcador: un solo bloque al medio del campo (la palabra, el porqué y cuatro botones
  // chicos iguales en dos filas), «Ver el campo» lo cierra y «Ver el resultado» lo vuelve a abrir, y «Ver el replay» abre el duelo recién jugado. (El orden golpe → chapa en 0 → palabra necesita un duelo ganado: se midió por script y lo cubre el de ganar por vidas.)
  test('TI-230, el final al rendirte: un solo bloque al medio del campo (palabra, porqué, botones chicos iguales), sin hoja ni marcador; «Ver el campo» y «Ver el resultado»; «Ver el replay» abre el duelo y «Volver al resultado» vuelve', async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    await startAuto(page)
    await press(page.locator('[data-mat-gear]'), isMobile)
    const options = page.locator('[data-auto-panel]').filter({ hasText: 'Vista 3D' })
    await expect(options).toBeVisible()
    const rendirse = options.getByRole('button', { name: 'Rendirse', exact: true })
    await rendirse.scrollIntoViewIfNeeded()
    await press(rendirse, isMobile)
    const confirm = page.getByRole('alertdialog', { name: '¿Rendirte en este duelo?' })
    await expect(confirm).toBeVisible()
    await press(confirm.getByRole('button', { name: 'Rendirse', exact: true }), isMobile)

    const hero = page.getByTestId('result-hero')
    await expect(hero, 'el final, ya').toBeVisible({ timeout: 10_000 })
    await expect(hero).toHaveAttribute('role', 'alertdialog')
    await expect(hero).toHaveAttribute('data-tone', 'lose')
    await expect(hero.getByRole('heading', { name: 'Perdiste' }), 'el título accesible, oculto a la vista').toHaveCount(1)
    await expect(page.getByTestId('lethal-blow'), 'rendirse no es un golpe letal').toHaveCount(0)

    // La palabra enorme, el porqué y nada más: ni hoja con título repetido ni marcador de vidas.
    const block = hero.locator('[data-result-block]')
    await expect(hero.locator('[data-result-word="lose"] p'), 'la palabra del resultado').toHaveText('Derrota')
    expect(await hero.locator('[data-result-word="lose"] p').evaluate((node) => parseFloat(getComputedStyle(node).fontSize)), 'la palabra es enorme (≥ 44 px)').toBeGreaterThanOrEqual(44)
    await expect(block, 'el porqué en una línea').toContainText('Te rendiste.')
    await expect(block, 'la hoja no repite la palabra').not.toContainText(/Perdiste/)
    await expect(hero.locator('[data-score]'), 'sin marcador de vidas').toHaveCount(0)
    expect(await hero.innerText(), 'ni «8000 a 8000» ni ningún «N a M»').not.toMatch(/\d+\s*a\s*\d+/)
    expect(await hero.evaluate((node) => getComputedStyle(node).backgroundColor), 'sin velo: el fondo del final es transparente').toBe('rgba(0, 0, 0, 0)')

    // Las acciones: botones chicos iguales (dos filas parejas en el celular; una sola en escritorio), la principal es «Jugar otra vez».
    const names = ['Guardar replay', 'Modo manual', 'Ver el replay', 'Jugar otra vez']
    const boxes = (await Promise.all(names.map(async (name) => hero.getByRole('button', { name, exact: true }).boundingBox()))) as Box2[]
    for (const [index, box] of boxes.entries()) {
      expect(box, `«${names[index]}» está`).not.toBeNull()
      expect(box.width, `«${names[index]}» mide lo mismo que «Guardar replay»`).toBeCloseTo(boxes[0]!.width, 0)
      expect(box.height, `alto de «${names[index]}»`).toBeGreaterThanOrEqual(isMobile ? 43.9 : 35.5)
    }
    expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y)), isMobile ? 'dos filas parejas' : 'una sola fila').toBeLessThanOrEqual(isMobile ? 60 : 2)
    await expect.poll(() => onTop(hero.getByRole('button', { name: 'Jugar otra vez', exact: true })), { message: 'lo que hay arriba de «Jugar otra vez» es el botón' }).toBe(true)

    // Un solo bloque al medio del campo, bajo de alto (el campo se ve): menos de un tercio de la pantalla y centrado; no tapa las chapas ni la ✕ la barra.
    const blockBox = (await block.boundingBox())!
    const viewport = page.viewportSize()!
    expect(blockBox.height, `el bloque (${Math.round(blockBox.height)} px) ocupa menos de un tercio del alto de la pantalla`).toBeLessThan(viewport.height / 3)
    const field = (await boxOf(page, '[aria-label="Campo"]'))!
    expect(Math.abs(blockBox.y + blockBox.height / 2 - (field.y + field.h / 2)), 'centrado en el medio del campo').toBeLessThanOrEqual(field.h * 0.15)
    const word = (await hero.locator('[data-result-word="lose"] p').boundingBox())!
    for (const side of ['mine', 'theirs']) {
      const plate = (await boxOf(page, `[data-life-badge][data-lp=${side}]`))!
      expect(plate.y + plate.h <= word.y || plate.y >= word.y + word.height || plate.x + plate.w <= word.x || plate.x >= word.x + word.width, `la palabra no tapa la chapa «${side}»`).toBe(true)
    }
    const close = hero.getByRole('button', { name: 'Ver el campo' })
    if (isMobile) expect((await close.boundingBox())!.height, 'la ✕ se toca con el dedo').toBeGreaterThanOrEqual(43.5)
    expect(await roundCorners(page), 'el final: esquinas rectas').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)

    // Sólo el bloque ataja toques: ⚙ (Opciones, con el registro del bot) se alcanza con el final abierto y con el campo solo.
    expect(await onTop(page.locator('[data-mat-gear]')), '⚙ se toca con el final abierto').toBe(true)
    // «Ver el campo» deja la mesa sola; «Ver el resultado» lo reabre.
    await press(close, isMobile)
    await expect(hero, 'la ✕ deja el campo solo').toHaveCount(0)
    expect(await onTop(page.locator('[data-mat-gear]')), '⚙ se toca con el campo solo').toBe(true)
    await press(page.locator('[data-mat-gear]'), isMobile)
    await expect(page.locator('[data-auto-panel]').getByText(/Qué hizo el bot/).first(), 'el registro «Qué hizo el bot y por qué» sigue en ⚙').toBeVisible()
    await page.keyboard.press('Escape')
    await press(page.getByRole('button', { name: 'Ver el resultado' }), isMobile)
    await expect(hero, '«Ver el resultado» lo reabre').toBeVisible()

    // «Ver el replay» (antes «Qué hizo el bot»): abre el duelo recién jugado, desde la jugada 0, con «Volver al resultado»; avanza y vuelve.
    await expect(hero.getByRole('button', { name: 'Qué hizo el bot' }), 'ya no hay registro de texto en el final').toHaveCount(0)
    await press(hero.getByRole('button', { name: 'Ver el replay', exact: true }), isMobile)
    const back = page.getByRole('button', { name: 'Volver al resultado' })
    await expect(back, 'el replay se abre con su salida «Volver al resultado»').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Ver desde el otro lado' }), 'el replay trae los dos lados').toBeVisible()
    await expect(page.getByRole('button', { name: 'Siguiente' }), 'el replay avanza de a un paso').toBeVisible()
    await press(page.getByRole('button', { name: 'Siguiente' }), isMobile)
    await press(back, isMobile)
    await expect(hero, '«Volver al resultado» vuelve al final').toBeVisible()
  })

  // TI-207 / TI-209: el final por vidas en orden. Un deck de 40 Ookazi (800 de daño cada una, sin objetivo ni respuesta): se activan todas las de la mano turno a turno hasta que el rival llega a 0. La última pasa por la escena de la cadena:
  // primero se va la escena, después el golpe letal en cámara lenta (la chapa espera), después la chapa cuenta hasta 0 y, tras una pausa, el cartel. Sin esperas fijas cortas: producción es más lenta, se afirma el orden y las pausas mínimas.
  test('TI-207, ganar por vidas: la escena de la cadena se va, después el golpe letal lento, la chapa cuenta hasta 0 y recién ahí el cartel', async ({ page, isMobile }) => {
    test.setTimeout(540_000)
    const ookazi = stateOf(Array.from({ length: 40 }, () => card(19523799, 'Ookazi', SPELL)))
    await page.addInitScript((deck) => {
      localStorage.setItem('ygo-probability-lab:v2', deck)
      localStorage.setItem('ygo-lab:auto-place', 'auto')
      localStorage.setItem('ygo-lab:auto-chain', 'never')
    }, ookazi)
    await page.goto('/#solo')
    await page.getByRole('button', { name: /^Jugar contra las handtraps/ }).click()
    await expect(mat(page)).toBeVisible({ timeout: 60_000 })
    await expect(phaseButton(page)).toBeEnabled({ timeout: 90_000 })
    // El observador por cuadro: golpe, escena (la que se va no cuenta), cartel y el número de la chapa del rival.
    await page.evaluate(`(() => {
      const rec = []
      window.__end = rec
      let last = ''
      const tick = () => {
        const frame = {
          blow: Boolean(document.querySelector('[data-testid="lethal-blow"]')),
          stage: Boolean(document.querySelector('[data-chain-stage]:not([data-leaving])')),
          hero: Boolean(document.querySelector('[data-testid="result-hero"]')),
          lp: document.querySelector('[data-life-badge][data-lp=theirs] .text-stat, [data-life-badge][data-lp=theirs] .text-lead')?.textContent ?? '',
        }
        const key = JSON.stringify(frame)
        if (key !== last) { last = key; rec.push({ t: performance.now(), ...frame }) }
        requestAnimationFrame(tick)
      }
      tick()
    })()`)
    const hero = page.getByTestId('result-hero')
    const deadline = Date.now() + 480_000
    while (Date.now() < deadline && !(await hero.count())) {
      if (await phaseButton(page).isEnabled().catch(() => false)) {
        const card = handList(page).getByRole('listitem', { name: 'Ookazi', exact: true })
        const activate = page.locator('[data-auto-panel]').getByRole('menuitem', { name: 'Activar', exact: true })
        if ((await card.count()) > 0) {
          await press(card.first(), isMobile)
          if (await activate.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
            await press(activate, isMobile)
            await page.waitForTimeout(700)
            continue
          }
          await page.keyboard.press('Escape')
        }
        // Sin Ookazi en la mano (o sin poder activarla todavía): a la Main Phase 1 o a terminar el turno.
        await press(phaseButton(page), isMobile)
        // El menú de fases (TI-214) trae las seis: de la Draw o la Standby se pasa a «Ir a Main Phase 1»; desde la Main 1 (la de ahora no es un destino), «Ir a End Phase» termina el turno.
        const main = page.getByRole('menuitem', { name: /^Ir a Main Phase 1/ })
        if (await main.count()) await press(main.first(), isMobile)
        else await press(page.getByRole('menuitem', { name: 'Ir a End Phase' }), isMobile)
        const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Terminar turno' })
        if (await confirm.isVisible().catch(() => false)) await press(confirm, isMobile)
        await page.waitForTimeout(1200)
      } else await page.waitForTimeout(300)
    }
    await expect(hero, 'el duelo se ganó por vidas').toBeVisible({ timeout: 20_000 })
    await expect(hero).toHaveAttribute('data-tone', 'win')
    // TI-223 / TI-230: la palabra enorme al medio del campo y, debajo, el porqué (sin hoja, sin velo, sin marcador de vidas) y los botones chicos.
    await expect(hero.locator('[data-result-word="win"] p'), 'la palabra del resultado').toHaveText('Victoria')
    await expect(hero.locator('[data-result-block]'), 'el bloque no repite la palabra').not.toContainText(/¡Ganaste!/)
    await expect(hero.locator('[data-score]'), 'sin marcador de vidas').toHaveCount(0)
    expect(await hero.innerText(), 'ni «8000 a 0» ni ningún «N a M»').not.toMatch(/\d+\s*a\s*\d+/)
    await expect(hero.locator('[data-result-block]'), 'el porqué en una línea').toContainText('Rival se quedó sin puntos de vida.')
    expect(await hero.locator('[data-result-word="win"] p').evaluate((node) => parseFloat(getComputedStyle(node).fontSize)), 'la palabra es enorme (≥ 44 px)').toBeGreaterThanOrEqual(44)
    const word = (await hero.locator('[data-result-word="win"] p').boundingBox())!
    expect(word.x, 'la palabra entra de lado a lado, sin cortarse').toBeGreaterThanOrEqual(0)
    expect(word.x + word.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(word.y + word.height, 'la palabra va sobre los botones').toBeLessThan((await hero.getByRole('button', { name: 'Jugar otra vez', exact: true }).boundingBox())!.y)
    expect((await hero.locator('[data-result-block]').boundingBox())!.height, 'el bloque ocupa menos de un tercio de la pantalla').toBeLessThan(page.viewportSize()!.height / 3)
    const rec = (await page.evaluate(() => (window as unknown as { __end: unknown }).__end)) as { t: number; blow: boolean; stage: boolean; hero: boolean; lp: string }[]
    const blowAt = rec.findIndex((frame) => frame.blow)
    expect(blowAt, 'hubo golpe letal').toBeGreaterThanOrEqual(0)
    expect(rec.filter((frame) => frame.blow && frame.stage), 'el golpe letal nunca coincide con la escena de la cadena (primero termina la cadena)').toEqual([])
    // La chapa espera mientras dura el golpe (cámara lenta: ~1,5 s) y recién después baja.
    const blowStart = rec[blowAt]!.t
    const counting = rec.findIndex((frame, index) => index > blowAt && frame.lp !== rec[blowAt]!.lp)
    expect(counting, 'la chapa baja después del golpe').toBeGreaterThan(blowAt)
    expect(rec[counting]!.t - blowStart, 'el golpe va en cámara lenta: la chapa espera ≥ 1,2 s').toBeGreaterThanOrEqual(1200)
    // El cartel no aparece mientras la chapa cuenta: sólo con el 0 a la vista, y tras una pausa.
    const zero = rec.findIndex((frame) => frame.lp === '0')
    expect(zero, 'la chapa llega a 0').toBeGreaterThanOrEqual(0)
    const shown = rec.findIndex((frame) => frame.hero)
    expect(shown, 'el cartel sale después del 0').toBeGreaterThan(zero)
    expect(rec[shown]!.lp, 'el cartel aparece con la chapa en 0').toBe('0')
    expect(rec.slice(0, shown).some((frame) => frame.hero), 'ningún cuadro con cartel antes').toBe(false)
    expect(rec[shown]!.t - rec[zero]!.t, 'una pausa para ver el 0 antes del cartel').toBeGreaterThanOrEqual(300)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'desborde horizontal del documento').toBeLessThanOrEqual(0)
  })
})

type Box2 = { x: number; y: number; width: number; height: number }

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
    // Las cartas llevan imagen (con el nombre impreso): la placa con el nombre de la escena de la cadena va sólo en la carta sin imagen.
    const art = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421 614"><rect width="421" height="614" fill="#7a4a1f"/><rect x="20" y="20" width="381" height="50" fill="#e8d9a8"/><rect x="50" y="90" width="320" height="320" fill="#3a5f8a"/></svg>'
    for (const pattern of ['**/api/card-image/**', 'https://images.ygoprodeck.com/**']) await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: art }))
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
    // TI-205: la escena se acomoda sobre el cartel: el número de la última carta queda entero, sin la hoja ni la ventana de «¿Respondés?» encima.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const panel = Array.from(document.querySelectorAll('[data-auto-panel]')).filter((node) => node.getClientRects().length > 0 && /¿Respondés?/.test(node.textContent ?? '')).pop()?.getBoundingClientRect()
            const number = Array.from(document.querySelectorAll('[data-chain-stage] [data-chain-number]')).pop()?.getBoundingClientRect()
            if (!panel || !number) return 'sin datos'
            return number.bottom > panel.top + 1 && number.top < panel.bottom && number.right > panel.left && number.left < panel.right ? 'tapado' : 'entero'
          }),
        { message: 'el número de la última carta no queda debajo del cartel de «¿Respondés?»', timeout: 6000 },
      )
      .toBe('entero')

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
    // TI-205: al resolver la escena se va entera y quedan los medallones, uno por eslabón, que se resuelven del último al primero (el «2», tu Ash, y después el «1», tu Foolish negado y tachado); al terminar no queda ninguno.
    await page.evaluate(`(() => {
      const seen = { order: [], overlap: 0, voided: [], armed: 0, plates: 0, withArt: 0, places: {} }
      window.__res = seen
      const tick = () => {
        const stage = document.querySelector('[data-chain-stage]:not([data-leaving])')
        if (stage && document.querySelector('[data-chain-medal]')) seen.armed += 1
        for (const card of document.querySelectorAll('[data-chain-card]')) {
          if (card.querySelector('img')) seen.withArt += 1
          if (card.querySelector('img') && card.querySelector('[data-chain-name]')) seen.plates += 1
        }
        for (const medal of document.querySelectorAll('[data-chain-medal]')) {
          const where = medal.closest('[data-hand-links]') ? 'mano' : (medal.closest('[data-drop]')?.getAttribute('data-drop') ?? medal.closest('[data-rival-drop]')?.getAttribute('data-rival-drop') ?? (medal.closest('[aria-label=Mano]') ? 'mano' : '?'))
          const places = (seen.places[medal.dataset.chainMedal] ??= [])
          if (!places.includes(where)) places.push(where)
          if ('resolving' in medal.dataset) {
            if (stage) seen.overlap += 1
            if (seen.order.at(-1) !== medal.dataset.chainMedal) seen.order.push(medal.dataset.chainMedal)
          }
          if (medal.hasAttribute('data-voided') && !seen.voided.includes(medal.dataset.chainMedal)) seen.voided.push(medal.dataset.chainMedal)
        }
        requestAnimationFrame(tick)
      }
      tick()
    })()`)
    await press(activate, isMobile)
    await expect(page.locator('[data-chain-card="2"]'), 'el segundo eslabón entra').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-chain-stage]')).toHaveCount(0, { timeout: 30_000 })
    await expect(phaseButton(page)).toBeEnabled({ timeout: 30_000 })
    await expect(page.locator('[data-chain-medal]'), 'al terminar la cadena no queda ningún medallón').toHaveCount(0)
    const resolved = (await page.evaluate(() => (window as unknown as { __res: unknown }).__res)) as { order: string[]; overlap: number; voided: string[]; armed: number; plates: number; withArt: number; places: Record<string, string[]> }
    expect(resolved.order, 'los medallones se resuelven del último al primero').toEqual(['2', '1'])
    expect(resolved.overlap, 'resolviendo no queda la escena en grande').toBe(0)
    expect(resolved.voided, 'el eslabón negado se tacha, y sólo él (no el «2»)').toEqual(['1'])
    expect(resolved.armed, 'armando no hay medallones').toBe(0)
    expect(resolved.withArt, 'las cartas de la escena se vieron con imagen').toBeGreaterThan(0)
    expect(resolved.plates, 'con imagen, la carta no lleva la placa con su nombre (ya está impreso)').toBe(0)
    // El medallón se queda donde se activó el efecto: el «1» (tu Foolish negado, que se va al Cementerio) no sigue a la carta.
    expect(resolved.places['1'], 'el medallón «1» no cambia de lugar ni sigue a la carta al Cementerio').toHaveLength(1)
    expect(resolved.places['1']![0], 'el «1» queda en su casilla de Mágica/Trampa').toMatch(/^st:/)
    expectStill(await readYs(page), 'al responder, minimizar y la cadena')
  })
})

// V-02 (M-03, elegir varias): la muestra de /playground (la misma hoja de CardPicker que usa el duelo; un efecto real que pida varias cartas en el deck de la prueba no se arma de forma estable).
test.describe('V-02, elegir varias (muestra de /playground)', () => {
  test.beforeEach(async ({ context }) => prepare(context, true))

  test('un solo cartel con las copias agrupadas («×N»), el orden numerado, el contador «N de M» y una sola principal a la derecha que se prende al completar', async ({ page, isMobile }) => {
    // /playground monta cientos de muestras y la traza que Playwright toma en cada toque tumba el renderizador del celular de la prueba (×3, con toque): en celular se midió por script (390×844, con toque).
    test.skip(isMobile, 'sólo escritorio: con la traza, el celular (×3) tumba la página de /playground')
    // /playground en un dev server con la máquina cargada tarda más de un minuto en montar (la ronda 5 lo midió): sin esperas cortas.
    test.setTimeout(240_000)
    await page.goto('/playground')
    // La muestra «Elegir varias · copias juntas»: su botón «Abrir la hoja» es el primero que le sigue al título.
    const title = page.locator('h3', { hasText: 'Elegir varias · copias juntas' })
    await expect(title, '/playground monta todas sus muestras (en un dev server tarda)').toBeAttached({ timeout: 180_000 })
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
