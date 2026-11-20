// El duelo automático por enlace (el núcleo de reglas en el navegador del anfitrión) de punta a punta: dos navegadores contra el relay y la app locales
// que levanta `playwright.config.ts`. Ana abre una sala privada automática (el modo de entrada) y Beto entra con `#duel?room=CÓDIGO`; o los dos tocan «Jugar ahora»
// (Ana abre la pública, Beto entra). docs/duelo-automatico-enlace.md
import { writeFileSync } from 'node:fs'

import { expect, test, type Browser, type Page } from '@playwright/test'

import { field, hand, phaseChip, player, rivalHand, shot } from './support/duelo'

// El núcleo tarda en cargar (wasm, datos y scripts) y la PC puede estar cargada: lo que espera al núcleo, con más margen.
const CORE = { timeout: 90_000 }

test.describe.configure({ timeout: 300_000 })

// Si falla, el árbol de accesibilidad de las dos pantallas queda junto a la traza (la captura no dice qué menú se abrió).
const open: { name: string; page: Page }[] = []
test.afterEach(async ({ browser }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    for (const { name, page } of open) writeFileSync(testInfo.outputPath(`aria-${name}.yaml`), await page.locator('body').ariaSnapshot().catch(String))
  open.length = 0
  // Cada prueba cierra sus navegadores: la sala no sigue abierta en la que viene.
  for (const context of browser.contexts()) await context.close()
})

/** Ana abre la sala automática, Beto entra por el código, los dos listos, piedra-papel-tijera y Ana va primero; espera a que el núcleo reparta. */
async function startAutoDuel(browser: Browser) {
  const ana = await player(browser, 'Ana')
  const beto = await player(browser, 'Beto')
  open.push({ name: 'ana', page: ana }, { name: 'beto', page: beto })

  await ana.goto('/#duel')
  await ana.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana')
  await ana.getByRole('textbox', { name: 'Tu nombre' }).press('Enter')
  // El modo de entrada es el automático: no se toca.
  await ana.getByRole('button', { name: /^Retar a un amigo/ }).click()
  await expect(ana).toHaveURL(/#duel\?room=[A-Za-z0-9]{8}$/)
  const code = /room=([A-Za-z0-9]{8})/.exec(ana.url())![1]!
  // La sala es automática (sin espectadores) y lo dice en sus reglas.
  await expect(ana.getByRole('region', { name: 'Reglas' }).getByText('Automáticas')).toBeVisible()
  await expect(ana.getByRole('button', { name: 'Copiar enlace para mirar' })).toHaveCount(0)

  await beto.goto(`/#duel?room=${code}`)
  await expect(beto.getByText('Ana te invitó a un duelo')).toBeVisible()
  // Escrito apenas aparece la sala, el nombre a veces se borra (el campo se rearma al llegar la sala): se vuelve a escribir hasta que Ana lo ve.
  await expect(async () => {
    await beto.getByRole('textbox', { name: 'Tu nombre' }).fill('Beto')
    await beto.getByRole('textbox', { name: 'Tu nombre' }).press('Enter')
    await expect(ana.getByRole('region', { name: '¿Quién empieza?' }).getByText('Beto')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })

  await dealAuto(ana, beto)
  return { ana, beto, code }
}

/** Los dos listos, piedra-papel-tijera y Ana va primero; espera a que el núcleo reparta. */
async function dealAuto(ana: Page, beto: Page) {
  // «Estoy listo» se prende cuando el anfitrión revisó los dos decks contra el núcleo (`autoCheck`).
  await ana.getByRole('button', { name: 'Estoy listo', exact: true }).click(CORE)
  await beto.getByRole('button', { name: 'Estoy listo', exact: true }).click(CORE)
  await ana.getByRole('button', { name: 'Piedra, papel o tijera', exact: true }).click()
  await ana.getByRole('button', { name: 'Piedra', exact: true }).click()
  await beto.getByRole('button', { name: 'Tijera', exact: true }).click()
  await ana.getByRole('button', { name: 'Ir primero', exact: true }).click()

  await expect(hand(ana)).toHaveCount(5, CORE)
  await expect(hand(beto)).toHaveCount(5, CORE)
  await expect(rivalHand(ana)).toHaveAccessibleName('Mano del rival: 5')
  await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 5')
}

/** Un jugador en Online con su nombre puesto (Enter lo guarda). */
async function online(browser: Browser, name: string) {
  const page = await player(browser, name)
  open.push({ name: name.toLowerCase(), page })
  await page.goto('/#duel')
  await page.getByRole('textbox', { name: 'Tu nombre' }).fill(name)
  await page.getByRole('textbox', { name: 'Tu nombre' }).press('Enter')
  return page
}

const playNow = (page: Page) => page.getByRole('button', { name: 'Jugar ahora', exact: true })

/**
 * «Jugar ahora» de los dos: Ana no encuentra salas y abre la pública (en el modo de sus reglas); Beto, ya con la sala de Ana en la arena, toca «Jugar ahora» y entra.
 * Devuelve cuándo tocó Beto. Cada uno ve el modo de la sala antes de estar listo.
 */
async function playNowPair(browser: Browser, ana: Page, auto: boolean) {
  await playNow(ana).click()
  await expect(ana).toHaveURL(/#duel\?room=[A-Za-z0-9]{8}$/)
  const anaRules = ana.getByRole('region', { name: 'Reglas' })
  await expect(anaRules.getByText('Pública', { exact: true })).toBeVisible()
  // Una sala automática no se ofrece para mirar; una manual, sí.
  await expect(anaRules.getByText('Automáticas', { exact: true })).toHaveCount(auto ? 1 : 0)
  await expect(ana.getByRole('button', { name: 'Copiar enlace para mirar' })).toHaveCount(auto ? 0 : 1)

  const beto = await online(browser, 'Beto')
  await expect(beto.getByRole('button', { name: 'Entrar a la sala de Ana' })).toBeVisible()
  const tapped = Date.now()
  await playNow(beto).click()
  await expect(ana.getByRole('region', { name: '¿Quién empieza?' }).getByText('Beto')).toBeVisible()
  await expect(beto.getByText('Ana te invitó a un duelo')).toBeVisible()
  await expect(beto.getByRole('region', { name: 'Reglas' }).getByText('Automáticas', { exact: true })).toHaveCount(auto ? 1 : 0)
  return { beto, tapped }
}

/** Espera a que sea el turno de `page` en su Main Phase 1 (el núcleo pasa solo la Draw y la Standby sin nada que responder). */
async function toMain1(page: Page) {
  await expect(phaseChip(page)).toBeEnabled(CORE)
  await expect(phaseChip(page)).toHaveAccessibleName('Fases: Main Phase 1', CORE)
}

/** Va a la fase `name` con el botón de las fases (en el automático, la respuesta que el núcleo espera). */
async function phase(page: Page, name: string) {
  await phaseChip(page).click()
  await page.getByRole('menuitem', { name: new RegExp(`^(Ir a )?${name}`) }).click()
}

/** Invoca de modo Normal el primer monstruo de la mano (si el núcleo pregunta la zona, la primera) y devuelve cuál era. */
async function normalSummon(page: Page): Promise<string> {
  const before = await field(page, 'mine').count()
  const first = hand(page).and(page.locator(':not([aria-label="Dark Hole"]):not([aria-label="Mirror Force"])')).first()
  const name = (await first.getAttribute('aria-label')) ?? ''
  await first.click()
  await page.getByRole('menuitem', { name: 'Invocación Normal', exact: true }).click()
  const zone = page.getByRole('button', { name: /^Zona de monstruo \d: elegir$/ }).first()
  await expect(zone.or(field(page, 'mine').nth(before))).toBeVisible()
  if (await zone.isVisible()) await zone.click()
  await expect(field(page, 'mine')).toHaveCount(before + 1)
  return name
}

/** Lo que se ve de la mesa desde `page`, con nombres en vez de lados: así las dos pantallas se comparan directo. */
async function view(page: Page, me: string, rival: string) {
  const lp: Record<string, number> = {}
  for (const label of await page.locator('[data-lp]').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''))) {
    const match = /^Puntos de vida de (\S+): (\d+)/.exec(label)
    if (match) lp[match[1]!] = Number(match[2])
  }
  return {
    lp,
    // El botón de las fases sólo se toca en el turno propio.
    turn: (await phaseChip(page).isEnabled()) ? me : rival,
    field: { [me]: await field(page, 'mine').count(), [rival]: await field(page, 'rival').count() },
    hand: { [me]: await hand(page).count(), [rival]: Number(/(\d+)/.exec((await rivalHand(page).getAttribute('aria-label')) ?? '')?.[1] ?? -1) },
  }
}

/** Las dos pantallas dicen lo mismo (vidas, campo y manos de cada uno); devuelve esa vista. */
async function sameTable(ana: Page, beto: Page) {
  let table = await view(ana, 'Ana', 'Beto')
  await expect(async () => {
    table = await view(ana, 'Ana', 'Beto')
    expect(await view(beto, 'Beto', 'Ana'), 'la mesa vista por Beto contra la de Ana').toEqual(table)
  }).toPass(CORE)
  return table
}

test('sala privada automática: de la sala a la primera vuelta, con las dos pantallas iguales', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await shot(ana, 'auto-01-ana-mesa')

  await test.step('Turno 1 de Ana: invoca de modo Normal y termina el turno', async () => {
    await toMain1(ana)
    await expect(phaseChip(beto)).toBeDisabled()
    await normalSummon(ana)
    await expect(field(beto, 'rival')).toHaveCount(1, CORE)
    await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 4')
    await phase(ana, 'End Phase')
  })

  await test.step('Turno 2 de Beto: roba, invoca, va a la Battle Phase y ataca', async () => {
    await toMain1(beto)
    await expect(phaseChip(ana)).toBeDisabled()
    await expect(hand(beto)).toHaveCount(6)
    await expect(rivalHand(ana)).toHaveAccessibleName('Mano del rival: 6', CORE)
    await normalSummon(beto)
    await expect(field(ana, 'rival')).toHaveCount(1, CORE)
    await phase(beto, 'Battle Phase')
    await expect(phaseChip(beto)).toHaveAccessibleName('Fases: Battle Phase', CORE)
    await shot(beto, 'auto-02-beto-batalla')
    // Recién con la pregunta de batalla del núcleo el monstruo lleva la espada («Puede atacar»): tocarlo antes no abre nada.
    await field(beto, 'mine').and(beto.locator('[aria-description="Puede atacar"]')).first().click(CORE)
    // Con una sola jugada, la carta tocada no abre menú: muestra la etiqueta «Atacar · <carta>».
    await beto.getByRole('menuitem', { name: 'Atacar', exact: true }).or(beto.getByRole('button', { name: /^Atacar · / })).click()
    // El objetivo: el monstruo de Ana, en la mesa (`data-attack-target`) o en la lista que abre el núcleo.
    const target = beto.locator('[data-attack-target="true"]').first()
    const listed = beto.getByRole('dialog').getByRole('button', { name: /ATK|Ana/ }).first()
    await expect(target.or(listed)).toBeVisible(CORE)
    if (await target.isVisible()) await target.click()
    else await listed.click()
  })

  await test.step('El combate se resuelve y las dos pantallas coinciden', async () => {
    const table = await sameTable(ana, beto)
    // Algo pasó en el combate: alguien perdió vidas o un monstruo dejó el campo.
    expect(table.lp.Ana! + table.lp.Beto! < 16_000 || table.field.Ana! + table.field.Beto! < 2, `la mesa tras el ataque: ${JSON.stringify(table)}`).toBe(true)
    await shot(ana, 'auto-03-ana-tras-ataque')
    await shot(beto, 'auto-03-beto-tras-ataque')
  })
})

/**
 * Lo que se ve al volver de una recarga, cuadro por cuadro (se instala antes de recargar): cuántas cartas tiene la mano, si sale un «±N» de vidas, si hay una hoja de cartas
 * reveladas y si estalla algo en el campo (`data-fx`). Volver tiene que entrar quieto: la mano entera de una, sin avisos ni hojas de lo que ya pasó (TI-367).
 */
function traceReturn() {
  const seen: string[] = []
  const t0 = performance.now()
  const tick = () => {
    const hand = document.querySelectorAll('[role="list"][aria-label="Mano"] [role="listitem"]').length
    const delta = document.querySelectorAll('[data-life-delta]').length
    const revealed = [...document.querySelectorAll('[role="dialog"]')].some((dialog) => /reveladas/i.test(dialog.textContent ?? ''))
    const fx = document.querySelectorAll('[data-fx]').length
    const now = `mano ${hand} · vidas ${delta} · reveladas ${revealed} · fx ${fx}`
    if (seen.at(-1) !== now) seen.push(now)
    ;(window as unknown as { __return: string[] }).__return = seen
    if (performance.now() - t0 < 30_000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Lo que pasó al volver (`traceReturn`): la mano no se repartió de a una y no salió ningún aviso de vidas ni hoja de reveladas. */
async function quietReturn(page: Page, cards: number) {
  const frames = await page.evaluate(() => (window as unknown as { __return?: string[] }).__return ?? [])
  test.info().annotations.push({ type: 'volver', description: frames.join(' | ') })
  const hands = new Set(frames.map((frame) => Number(/mano (\d+)/.exec(frame)?.[1])))
  expect([...hands].filter((count) => count !== 0 && count !== cards), `la mano al volver, cuadro por cuadro: ${frames.join(' | ')}`).toEqual([])
  expect(frames.filter((frame) => !frame.includes('vidas 0') || frame.includes('reveladas true')), 'avisos de vidas u hojas de reveladas al volver').toEqual([])
}

/** Lo que una recarga no tiene que cambiar, visto desde `page`: la mesa, las cartas de la mano y la fase. */
async function reloadable(page: Page, me: string, rival: string) {
  return {
    ...(await view(page, me, rival)),
    handNames: await hand(page).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
    phase: await phaseChip(page).getAttribute('aria-label'),
  }
}

test('reconexión: el invitado y después el anfitrión recargan en pleno duelo, vuelven igual y el otro sigue jugando', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)

  await test.step('Beto (invitado) recarga en el turno de Ana', async () => {
    await toMain1(ana)
    await normalSummon(ana)
    await sameTable(ana, beto)
    const before = await reloadable(beto, 'Beto', 'Ana')
    await beto.addInitScript(traceReturn)
    await beto.reload()
    await expect(hand(beto)).toHaveCount(before.handNames.length, CORE)
    await expect.poll(() => reloadable(beto, 'Beto', 'Ana'), CORE).toEqual(before)
    await quietReturn(beto, before.handNames.length)
    await shot(beto, 'auto-04-beto-tras-recargar')
  })

  await test.step('Ana sigue: termina su turno y Beto invoca', async () => {
    await phase(ana, 'End Phase')
    await toMain1(beto)
    await normalSummon(beto)
    await sameTable(ana, beto)
  })

  await test.step('Ana (anfitriona, corre el núcleo) recarga en el turno de Beto', async () => {
    const before = await reloadable(ana, 'Ana', 'Beto')
    await ana.addInitScript(traceReturn)
    await ana.reload()
    await expect(hand(ana)).toHaveCount(before.handNames.length, CORE)
    await expect.poll(() => reloadable(ana, 'Ana', 'Beto'), CORE).toEqual(before)
    await quietReturn(ana, before.handNames.length)
    await shot(ana, 'auto-05-ana-tras-recargar')
  })

  await test.step('Beto sigue: termina su turno y Ana roba e invoca', async () => {
    await phase(beto, 'End Phase')
    await toMain1(ana)
    await normalSummon(ana)
    await sameTable(ana, beto)
  })
})

/** En el turno 1 de Ana, tras su invocación: Ana pide pasar a manual desde Opciones, Beto acepta y la mesa manual sigue a la automática. */
async function autoToManual(browser: Browser) {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await normalSummon(ana)
  const auto = await sameTable(ana, beto)

  await ana.getByRole('button', { name: 'Opciones', exact: true }).click()
  await ana.getByRole('dialog', { name: 'Opciones' }).getByRole('button', { name: 'Pasar a manual', exact: true }).click()
  await ana.keyboard.press('Escape')
  await beto.locator('[data-prompt]').getByRole('button', { name: 'Pasar a manual', exact: true }).click(CORE)
  // La mesa manual tiene ⋯ (el automático, sólo el ⚙ de Opciones).
  await expect(ana.getByRole('button', { name: 'Más opciones', exact: true })).toBeVisible(CORE)
  await expect(beto.getByRole('button', { name: 'Más opciones', exact: true })).toBeVisible(CORE)
  expect(await sameTable(ana, beto), 'la mesa manual sigue a la automática').toEqual(auto)
  return { ana, beto, auto }
}

test('de automático a manual: los dos aceptan y la mesa manual sigue como estaba', async ({ browser }) => {
  const { ana, beto } = await autoToManual(browser)
  await shot(ana, 'auto-06-ana-manual')
  // La mesa manual anda: Ana va a la End Phase y Beto lo ve.
  await phaseChip(ana).click()
  await ana.getByRole('menuitem', { name: /^(Ir a )?End Phase/ }).click()
  await beto.getByRole('button', { name: 'Dejar pasar' }).click()
  await expect(phaseChip(beto)).toHaveAccessibleName('Fases: End Phase')
})

test('de manual a automático: Ana (su turno, Main Phase 1) lo pide, Beto acepta y el núcleo sigue con la mesa como estaba', async ({ browser }) => {
  const { ana, beto, auto } = await autoToManual(browser)

  await test.step('Ana (su turno, Main Phase 1) pide seguir en automático y Beto acepta', async () => {
    await ana.getByRole('button', { name: 'Más opciones', exact: true }).click()
    // ⋯ → «Opciones del duelo» → «Modo automático»: «Seguir en automático».
    await ana.getByRole('menuitem', { name: 'Opciones del duelo', exact: true }).click()
    await ana.getByRole('button', { name: 'Seguir en automático', exact: true }).click()
    await ana.getByRole('button', { name: 'Pedir pasar a automático', exact: true }).click()
    await beto.getByRole('button', { name: 'Pasar a automático', exact: true }).click(CORE)
    await expect(ana.getByRole('button', { name: 'Opciones', exact: true })).toBeVisible(CORE)
    await expect(beto.getByRole('button', { name: 'Opciones', exact: true })).toBeVisible(CORE)
    // El turno vuelve a empezar (límite aceptado), con la mesa como estaba; ninguno ve la mano del otro (la anfitriona corre el núcleo con todo: su mesa no lo muestra).
    await toMain1(ana)
    await expect(rivalHand(ana), 'la mano de Beto, vista por Ana').toHaveAccessibleName(/^Mano del rival: \d+$/)
    await expect(rivalHand(beto), 'la mano de Ana, vista por Beto').toHaveAccessibleName(/^Mano del rival: \d+$/)
    expect(await sameTable(ana, beto), 'la mesa automática sigue a la manual').toEqual(auto)
    await shot(ana, 'auto-07-ana-otra-vez-automatico')
  })

  await test.step('Ana recarga el duelo rearmado: la mesa vuelve igual y la mano de Beto sigue oculta', async () => {
    await ana.reload()
    await expect.poll(() => view(ana, 'Ana', 'Beto'), CORE).toEqual(auto)
    await expect(rivalHand(ana)).toHaveAccessibleName(/^Mano del rival: \d+$/)
    await sameTable(ana, beto)
  })

  await test.step('El núcleo sigue: Ana termina el turno y Beto invoca', async () => {
    await phase(ana, 'End Phase')
    await toMain1(beto)
    await normalSummon(beto)
    await sameTable(ana, beto)
  })
})

test('«Jugar ahora» de los dos: en menos de un minuto están en un duelo automático y Ana puede jugar', async ({ browser }) => {
  const ana = await online(browser, 'Ana')
  const { beto, tapped } = await playNowPair(browser, ana, true)
  await dealAuto(ana, beto)
  await toMain1(ana)
  const elapsed = Date.now() - tapped
  console.log(`«Jugar ahora» de Beto → primera jugada de Ana: ${elapsed} ms`)
  test.info().annotations.push({ type: 'jugar-ahora-ms', description: String(elapsed) })
  expect(elapsed, 'del toque de Beto a la primera jugada posible').toBeLessThan(60_000)
  await shot(ana, 'auto-10-ana-jugar-ahora')

  await normalSummon(ana)
  await expect(field(beto, 'rival')).toHaveCount(1, CORE)

  // Un tercero no ve la sala para mirarla: salió de las que esperan al entrar Beto y nunca pasa a los duelos en vivo.
  const caro = await online(browser, 'Caro')
  await expect(caro.getByRole('region', { name: 'En la arena ahora' })).toHaveAttribute('aria-busy', 'false')
  await expect(caro.getByRole('button', { name: 'Mirar el duelo de Ana' })).toHaveCount(0)
  await expect(caro.getByRole('button', { name: 'Entrar a la sala de Ana' })).toHaveCount(0)
})

test('«Jugar ahora» con la sala pasada a manual en las reglas: el duelo arranca manual', async ({ browser }) => {
  const ana = await online(browser, 'Ana')
  await ana.getByRole('button', { name: /^Reglas del duelo/ }).click()
  const rules = ana.getByRole('dialog', { name: 'Reglas del duelo' })
  await rules.getByRole('radio', { name: 'Manual' }).click()
  await rules.getByRole('button', { name: 'Guardar reglas' }).click()
  await expect(rules).toBeHidden()
  const { beto } = await playNowPair(browser, ana, false)

  await ana.getByRole('button', { name: 'Estoy listo', exact: true }).click()
  await beto.getByRole('button', { name: 'Estoy listo', exact: true }).click()
  await ana.getByRole('button', { name: 'Piedra, papel o tijera', exact: true }).click()
  await ana.getByRole('button', { name: 'Piedra', exact: true }).click()
  await beto.getByRole('button', { name: 'Tijera', exact: true }).click()
  await ana.getByRole('button', { name: 'Ir primero', exact: true }).click()
  await expect(ana.getByRole('heading', { name: 'Vas primero' })).toBeVisible()
  await expect(hand(ana)).toHaveCount(5)
  await expect(hand(beto)).toHaveCount(5)
  // La mesa manual tiene ⋯ (el automático, sólo el ⚙ de Opciones).
  await expect(ana.getByRole('button', { name: 'Más opciones', exact: true })).toBeVisible()
  await expect(beto.getByRole('button', { name: 'Más opciones', exact: true })).toBeVisible()
})

test('revancha: Beto se rinde, los dos la aceptan y arranca otro duelo automático', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await normalSummon(ana)

  await test.step('Beto se rinde desde Opciones', async () => {
    await beto.getByRole('button', { name: 'Opciones', exact: true }).click()
    await beto.getByRole('dialog', { name: 'Opciones' }).getByRole('button', { name: 'Rendirse', exact: true }).click()
    await beto.getByRole('alertdialog').getByRole('button', { name: /^Rendir(me|se)$/ }).click()
    await expect(ana.getByRole('heading', { name: '¡Ganaste!' })).toBeVisible(CORE)
    await expect(beto.getByRole('heading', { name: 'Perdiste' })).toBeVisible(CORE)
    await shot(beto, 'auto-08-beto-perdio')
  })

  await test.step('Los dos piden la revancha, elige Beto (perdió) y el núcleo reparte otra vez', async () => {
    await ana.getByRole('button', { name: 'Revancha', exact: true }).click()
    await expect(beto.getByText('Ana quiere la revancha.')).toBeVisible()
    await beto.getByRole('button', { name: 'Revancha', exact: true }).click()
    await beto.getByRole('button', { name: 'Ir primero', exact: true }).click(CORE)
    await expect(hand(beto)).toHaveCount(5, CORE)
    await expect(hand(ana)).toHaveCount(5, CORE)
    await toMain1(beto)
    const table = await sameTable(ana, beto)
    expect(table).toEqual({ lp: { Ana: 8000, Beto: 8000 }, turn: 'Beto', field: { Ana: 0, Beto: 0 }, hand: { Ana: 5, Beto: 5 } })
    await normalSummon(beto)
    await sameTable(ana, beto)
    await shot(beto, 'auto-09-beto-revancha')
  })
})

// Si el otro se va (cierra la pestaña, se queda sin señal), el que se queda nunca queda colgado (TI-352): la mesa se tapa con «Duelo en pausa» y el nombre del que salió,
// y desde ahí puede salir y abrir otra sala sin recargar. Si el que se fue es el anfitrión, el invitado no puede seguir solo (no tiene el núcleo): lo mismo.

/** Cierra la pestaña de `page` (su socket se corta como al cerrar el navegador). */
async function closeTab(page: Page) {
  open.splice(open.findIndex((item) => item.page === page), 1)
  await page.close()
}

/** El que se queda (`stay`): la pausa dice que `gone` salió, en segundos; sale con su ✕ y puede abrir otra sala sin recargar. */
async function strandedCanLeave(stay: Page, gone: string, since: number) {
  const pause = stay.getByRole('alertdialog', { name: 'Duelo en pausa' })
  await expect(pause).toBeVisible({ timeout: 30_000 })
  const waited = Date.now() - since
  console.log(`${gone} se fue → la pausa de quien se queda: ${waited} ms`)
  test.info().annotations.push({ type: 'pausa-ms', description: String(waited) })
  await expect(pause.getByRole('status')).toHaveText(`${gone} salió del duelo. Sigue cuando vuelva, con la mesa como la dejaron.`)
  const code = /room=([A-Za-z0-9]{8})/.exec(stay.url())![1]!
  await pause.getByRole('button', { name: 'Salir del duelo', exact: true }).click()
  await stay.getByRole('button', { name: /^Retar a un amigo/ }).click()
  await expect(stay).toHaveURL(/#duel\?room=[A-Za-z0-9]{8}$/)
  expect(/room=([A-Za-z0-9]{8})/.exec(stay.url())![1], 'otra sala').not.toBe(code)
  await expect(stay.getByRole('region', { name: 'Reglas' }).getByText('Automáticas')).toBeVisible()
}

test('abandono: Beto (invitado) cierra la pestaña en su turno y Ana no queda colgada', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await normalSummon(ana)
  await phase(ana, 'End Phase')
  await toMain1(beto)
  const since = Date.now()
  await closeTab(beto)
  await strandedCanLeave(ana, 'Beto', since)
})

test('abandono: Beto (invitado) cierra la pestaña en el turno de Ana y Ana no queda colgada', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  const since = Date.now()
  await closeTab(beto)
  await strandedCanLeave(ana, 'Beto', since)
})

test('abandono: Ana (anfitriona, corre el núcleo) cierra la pestaña en su turno y Beto no queda colgado', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await normalSummon(ana)
  const since = Date.now()
  await closeTab(ana)
  await strandedCanLeave(beto, 'Ana', since)
})

test('abandono: Ana (anfitriona) cierra la pestaña en el turno de Beto y Beto no queda colgado', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await phase(ana, 'End Phase')
  await toMain1(beto)
  const since = Date.now()
  await closeTab(ana)
  await strandedCanLeave(beto, 'Ana', since)
})

test('sin señal un rato: Beto se queda sin conexión 10 s y vuelve; no es abandono y el duelo sigue', async ({ browser }) => {
  const { ana, beto } = await startAutoDuel(browser)
  await toMain1(ana)
  await normalSummon(ana)
  const table = await sameTable(ana, beto)

  await beto.context().setOffline(true)
  await beto.waitForTimeout(10_000)
  await beto.context().setOffline(false)
  // Nadie ganó ni perdió: la mesa vuelve como estaba y Ana sigue jugando.
  await expect(ana.getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeHidden(CORE)
  await expect(beto.getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeHidden(CORE)
  await expect(ana.getByRole('heading', { name: '¡Ganaste!' })).toHaveCount(0)
  expect(await sameTable(ana, beto)).toEqual(table)
  await phase(ana, 'End Phase')
  await toMain1(beto)
  await normalSummon(beto)
  await sameTable(ana, beto)
})
