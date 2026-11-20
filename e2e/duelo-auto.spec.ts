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
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    for (const { name, page } of open) writeFileSync(testInfo.outputPath(`aria-${name}.yaml`), await page.locator('body').ariaSnapshot().catch(String))
  // Cada prueba cierra sus navegadores: la sala no sigue abierta en la que viene.
  for (const { page } of open.splice(0)) await page.context().close()
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
