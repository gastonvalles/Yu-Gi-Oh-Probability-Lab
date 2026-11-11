// QA de SÓLO LECTURA contra el sitio publicado (`npm run test:prod`): el duelo rearmado (TI-138: campo de siete columnas, fondo remolino, esquinas rectas, chapas y línea, menús), en celular y escritorio.
// Nunca crea una sala ni envía un formulario: las rutas con # son locales al navegador y el deck se siembra en el `localStorage` de la prueba. El catálogo de YGOPRODeck se responde vacío y las imágenes de cartas se cortan.
// Dos grupos: la práctica MANUAL (`ygo-lab:auto-duel` en «off»: «Solo» → «Jugar contra las handtraps» abre la mesa sin núcleo ni relay) y el duelo AUTOMÁTICO (sólo contra el sitio publicado: necesita `/auto-data/*` y el núcleo).
// Cada caso afirma un criterio de aceptación de TI-140 a TI-148: 7 pistas y sin scroll horizontal, el campo y tu mano quietos al abrir una carta, ningún `border-radius` distinto de 0 (tampoco en la barra ni en el panel «Pasos y combos»), un solo AVIF de fondo por ancho,
// el menú manual intacto (con «Al deck ›») y, en el automático, la ficha sin «Más», seis fases cuadradas, las chapas y la línea de alto fijo.
//
// Lo que se afirma en la práctica manual y no en el duelo: las chapas («Vos» y «Rival») y la línea (`data-duel-line`) sólo existen en un duelo (automático o por enlace); la práctica manual no tiene vidas.
import { expect, test, type Page } from '@playwright/test'

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

/** Aislamiento: deck sembrado, sin mascotas ni sonidos, catálogo vacío y sin imágenes de cartas. `auto` deja el modo del duelo en su valor de fábrica (automático) o lo apaga (la mesa manual). */
async function prepare(context: import('@playwright/test').BrowserContext, auto: boolean) {
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
    { deck: deckState, manual: !auto },
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
    // Un muestreador por cuadro: guarda el mínimo y el máximo de la `y` del campo y de la mano durante todo el gesto (un salto que vuelve no se escapa).
    await page.evaluate(`(() => {
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

    if (isMobile) await item.tap()
    else await item.click()
    const sheet = page.getByRole('menu', { name, exact: true })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('menuitem').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    const seen = (await page.evaluate(() => {
      cancelAnimationFrame((window as unknown as { __raf: number }).__raf)
      return (window as unknown as { __ys: Record<'field' | 'hand', [number, number]> }).__ys
    })) as Record<'field' | 'hand', [number, number]>
    expect(seen.field[1] - seen.field[0], `la y del campo varió entre ${seen.field[0]} y ${seen.field[1]}`).toBeLessThanOrEqual(0.5)
    expect(seen.hand[1] - seen.hand[0], `la y de tu mano varió entre ${seen.hand[0]} y ${seen.hand[1]}`).toBeLessThanOrEqual(0.5)
  })

  test('esquinas rectas: en la mesa (la barra, el ⋯, el panel «Pasos y combos» y sus fichas) y en la hoja o el menú de una carta, ningún `border-radius` distinto de 0', async ({ page, isMobile }) => {
    await openMat(page)
    // La mesa y, por portal, su hoja, su menú o su panel: cada raíz `mat-square` y todo lo que lleva adentro. `rounded-full` computa a un valor enorme (3.35544e+07 px): también cuenta.
    const roundCorners = () =>
      page.evaluate(() => {
        const roots = new Set<Element>([document.querySelector('[aria-label="Mesa de práctica"]')!, ...document.querySelectorAll('.mat-square')])
        const all = new Set<Element>()
        for (const root of roots) for (const node of [root, ...root.querySelectorAll('*')]) all.add(node)
        return [...all].flatMap((node) => {
          const style = getComputedStyle(node)
          const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
          return radii.every((radius) => parseFloat(radius) === 0) ? [] : [`${node.tagName.toLowerCase()}[${node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 20)}] y=${Math.round(node.getBoundingClientRect().top)}`]
        })
      })

    // Escritorio: el panel lateral está abierto, con las fichas de «Salidas y problemas» abajo.
    if (!isMobile) await expect(page.getByRole('region', { name: 'Pasos y combos' })).toBeVisible()
    expect(await roundCorners(), 'elementos de la mesa con `border-radius` distinto de 0').toEqual([])

    // El ⋯ abierto (sus interruptores) y, en el celular, el panel de pasos en su diálogo.
    await page.getByRole('button', { name: 'Más opciones' }).first().click()
    await expect(page.getByRole('menuitemcheckbox').first()).toBeVisible()
    expect(await roundCorners(), 'con el ⋯ abierto').toEqual([])
    await page.keyboard.press('Escape')
    if (isMobile) {
      await page.getByRole('button', { name: 'Pasos y combos' }).tap()
      await expect(page.getByRole('dialog', { name: 'Pasos y combos' })).toBeVisible()
      expect(await roundCorners(), 'con el panel «Pasos y combos» abierto').toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Pasos y combos' })).toHaveCount(0)
    }

    // La hoja (celular) o el menú (escritorio) de una carta.
    const { item, name } = await monsterOf(page)
    if (isMobile) await item.tap()
    else await item.click()
    await expect(page.getByRole('menu', { name, exact: true })).toBeVisible()
    expect(await roundCorners(), 'con la hoja o el menú de una carta').toEqual([])
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
})

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// El duelo AUTOMÁTICO contra el bot de handtraps: sólo existe donde están `/auto-data/*` y el núcleo (el sitio publicado). Contra un preview local, `/auto-data/*` no está: se saltea.
// Sin validar contra un servidor (el Jefe lo corre tras el deploy): sólo lecturas: abrir la ficha de una carta, abrir el selector de fases y cerrarlos. No juega nada, no crea sala.

test.describe('duelo automático (sólo contra el sitio publicado)', () => {
  test.skip(({ baseURL }) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(baseURL ?? ''), 'necesita /auto-data/* y el núcleo: no están en un preview local')
  test.beforeEach(async ({ context }) => prepare(context, true))

  test('la ficha de una carta de la mano muestra sus jugadas sin «Más», las fases son 6 botones cuadrados, no hay «1/1» y, en el celular, las chapas y la línea de alto fijo', async ({ page, isMobile }) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    await page.goto('/#solo')
    // Con el modo de fábrica (automático) y Handtraps elegido, «Jugar contra las handtraps» abre el duelo automático.
    await page.getByRole('button', { name: /^Jugar contra las handtraps/ }).click()
    await expect(mat(page)).toBeVisible({ timeout: 60_000 })
    // Tu DP y tu SP pasan solas hasta la Main Phase 1 (el núcleo pregunta qué hacés): ahí el botón de fases se habilita.
    const phase = page.getByRole('button', { name: /^Fases: / })
    await expect(phase).toHaveAccessibleName('Fases: Main Phase 1', { timeout: 60_000 })
    await expect(phase).toBeEnabled()
    await expect(handList(page).getByRole('listitem').first()).toBeVisible()

    // Las chapas y la línea (celular): «Vos» y «Rival» a la vista, la barra sin el marcador de vidas y la línea con el mismo alto antes y después.
    const line = page.locator('[data-duel-line]')
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
    if (isMobile) await monster.first().tap()
    else await monster.first().click()
    const sheet = page.locator('[data-auto-panel]').filter({ has: page.getByRole('menuitem') })
    await expect(sheet).toBeVisible()
    const plays = sheet.getByRole('menuitem')
    expect(await plays.count(), `jugadas de ${name}`).toBeGreaterThanOrEqual(1)
    expect(await plays.count(), `jugadas de ${name}`).toBeLessThanOrEqual(4)
    await expect(sheet.getByRole('menuitem', { name: /^Más/ })).toHaveCount(0)
    await expect(page.getByText(/^\d+\s*\/\s*\d+$/)).toHaveCount(0)
    if (isMobile) expect(await lineHeight(), 'alto de la línea con la ficha abierta').toBe(before)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    // Las fases: seis botones cuadrados (la caja de cada uno mide lo mismo de ancho que de alto, ±1 px).
    await phase.click()
    const phases = page.getByRole('menu', { name: 'Elegí la fase a la que pasás' }).getByRole('menuitem')
    await expect(phases).toHaveCount(6)
    const boxes = await phases.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = (node.firstElementChild ?? node).getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    for (const { width, height } of boxes) expect(Math.abs(width - height), `caja de fase de ${width}×${height}`).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    if (isMobile) expect(await lineHeight(), 'alto de la línea tras la jugada').toBe(before)
    expect(errors, 'errores de página propios').toEqual([])
  })
})
