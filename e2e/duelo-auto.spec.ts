// El duelo automático por enlace (el núcleo de reglas en el navegador del anfitrión) de punta a punta: dos navegadores contra el relay y la app locales
// que levanta `playwright.config.ts`. Ana abre una sala privada automática (el modo de entrada) y Beto entra con `#duel?room=CÓDIGO`. docs/duelo-automatico-enlace.md
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
  return { ana, beto, code }
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
    await beto.reload()
    await expect(hand(beto)).toHaveCount(before.handNames.length, CORE)
    await expect.poll(() => reloadable(beto, 'Beto', 'Ana'), CORE).toEqual(before)
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
    await ana.reload()
    await expect(hand(ana)).toHaveCount(before.handNames.length, CORE)
    await expect.poll(() => reloadable(ana, 'Ana', 'Beto'), CORE).toEqual(before)
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

// Falla de la app (TI-350): al volver a automático, el anfitrión ve la mano del invitado boca arriba («Mano del rival: Celtic Guardian, …»).
test.fixme('de manual a automático: Ana (su turno, Main Phase 1) lo pide, Beto acepta y el núcleo sigue con la mesa como estaba', async ({ browser }) => {
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
    // El turno vuelve a empezar (límite aceptado), con la mesa como estaba; la mano de Beto sigue oculta para Ana.
    await toMain1(ana)
    await expect(rivalHand(ana), 'la mano de Beto, vista por Ana').toHaveAccessibleName(/^Mano del rival: \d+$/)
    expect(await sameTable(ana, beto), 'la mesa automática sigue a la manual').toEqual(auto)
    await shot(ana, 'auto-07-ana-otra-vez-automatico')
  })

  await test.step('El núcleo sigue: Ana termina el turno y Beto invoca', async () => {
    await phase(ana, 'End Phase')
    await toMain1(beto)
    await normalSummon(beto)
    await sameTable(ana, beto)
  })
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
