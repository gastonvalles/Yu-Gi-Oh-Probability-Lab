// La visión de Gastón («sin crear cuenta ni necesitar desbloquear cartas»), de punta a punta: alguien que nunca entró juega un duelo automático en menos de un minuto.
// Navegadores sin nada guardado (ni deck, ni idioma, ni mascotas): sin deck propio, Online y Solo le prestan uno de los mazos de los bots.
import { writeFileSync } from 'node:fs'

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { hand, phaseChip, rivalHand, shot } from './support/duelo'

// El núcleo tarda en cargar (wasm, datos y scripts) y la PC puede estar cargada: lo que espera al núcleo, con más margen.
const CORE = { timeout: 90_000 }

test.describe.configure({ timeout: 300_000 })

const open: { name: string; page: Page }[] = []
test.afterEach(async ({ browser }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    for (const { name, page } of open) writeFileSync(testInfo.outputPath(`aria-${name}.yaml`), await page.locator('body').ariaSnapshot().catch(String))
  open.length = 0
  for (const context of browser.contexts()) await context.close()
})

/** Un navegador nuevo y vacío: como quien abre el sitio por primera vez. */
async function visitor(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.on('pageerror', (error) => console.log(`[${name}] pageerror: ${error.message}`))
  open.push({ name, page })
  return page
}

const playNow = (page: Page) => page.getByRole('button', { name: 'Jugar ahora', exact: true })

test('Online: dos visitantes sin deck, de «Jugar ahora» a la primera jugada en menos de un minuto', async ({ browser }) => {
  const ana = await visitor(browser, 'ana')
  const beto = await visitor(browser, 'beto')
  await ana.goto('/')
  await beto.goto('/')
  let taps = 0
  const tap = async (target: Locator, options = {}) => {
    await target.click(options)
    taps += 1
  }

  // Del primer toque (el «Jugar ahora» de Inicio) a la primera jugada posible de Ana.
  await expect(playNow(ana)).toBeVisible()
  const start = Date.now()
  await tap(playNow(ana))
  await expect(ana).toHaveURL(/#duel$/)
  // El prestado ya puesto: el chip, el mazo y ningún aviso de deck arriba.
  await expect(ana.getByText('Sky Striker · 40')).toBeVisible()
  await expect(ana.getByText('Prestado', { exact: true })).toBeVisible()
  await expect(ana.getByText(/Un duelo se juega con 40 cartas/)).toHaveCount(0)
  await shot(ana, 'visitante-online')
  await tap(playNow(ana))
  await expect(ana).toHaveURL(/#duel\?room=[A-Za-z0-9]{8}$/)
  await expect(ana.getByRole('region', { name: 'Reglas' }).getByText('Automáticas', { exact: true })).toBeVisible()

  await tap(playNow(beto))
  await expect(beto.getByText('Sky Striker · 40')).toBeVisible()
  await expect(beto.getByRole('button', { name: /^Entrar a la sala de / })).toBeVisible()
  await tap(playNow(beto))
  await expect(beto.getByRole('region', { name: 'Reglas' }).getByText('Automáticas', { exact: true })).toBeVisible()

  // «Estoy listo» se prende cuando el anfitrión revisó los dos decks contra el núcleo: el prestado pasa.
  await tap(ana.getByRole('button', { name: 'Estoy listo', exact: true }), CORE)
  await tap(beto.getByRole('button', { name: 'Estoy listo', exact: true }), CORE)
  await tap(ana.getByRole('button', { name: 'Piedra, papel o tijera', exact: true }))
  await tap(ana.getByRole('button', { name: 'Piedra', exact: true }))
  await tap(beto.getByRole('button', { name: 'Tijera', exact: true }))
  await tap(ana.getByRole('button', { name: 'Ir primero', exact: true }))

  await expect(hand(ana)).toHaveCount(5, CORE)
  await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 5', CORE)
  await expect(phaseChip(ana)).toBeEnabled(CORE)
  await expect(phaseChip(ana)).toHaveAccessibleName('Fases: Main Phase 1', CORE)
  const seconds = (Date.now() - start) / 1000
  console.log(`visitante-nuevo online: ${seconds.toFixed(1)} s y ${taps} toques entre los dos (Ana: 5)`)
  await shot(ana, 'visitante-online-mesa')
  expect(seconds).toBeLessThan(60)
})

test('Solo: un visitante sin deck elige un bot y la mesa reparte con el prestado (nunca el mismo mazo que el bot)', async ({ browser }) => {
  const page = await visitor(browser, 'solo')
  await page.goto('/#solo')
  await expect(page.getByText('Sky Striker · 40')).toBeVisible()
  await expect(page.getByText(/Para repartir la mano/)).toHaveCount(0)

  const start = Date.now()
  await page.getByRole('radio', { name: /^Sky Striker/ }).click()
  // Contra el bot de Sky Striker se presta otro: nada de espejos.
  await expect(page.getByText('Angelechy · 40')).toBeVisible()
  await page.getByRole('button', { name: 'Jugar contra Sky Striker', exact: true }).click()
  await expect(hand(page)).toHaveCount(5, CORE)
  console.log(`visitante-nuevo solo: ${((Date.now() - start) / 1000).toFixed(1)} s de elegir el bot a la mano repartida (2 toques)`)

  // La mano es del prestado: cada carta (`card-<passcode>-<copia>`) está en la lista de Angelechy.
  const ids = await hand(page).evaluateAll((items) => items.map((item) => item.getAttribute('data-card-id') ?? item.querySelector('[data-card-id]')?.getAttribute('data-card-id') ?? ''))
  // La lista, del propio Vite de la prueba (el módulo de la app, sin copiarla acá).
  const angelechy = await page.evaluate(async (path) => {
    const { ANGELECHY_DECK } = (await import(/* @vite-ignore */ path)) as { ANGELECHY_DECK: { main: [number, number][] } }
    return ANGELECHY_DECK.main.map(([code]) => code)
  }, '/src/app/bot-deck-lists.ts')
  expect(ids.map((id) => Number(/^card-(\d+)-/.exec(id)?.[1])).every((code) => angelechy.includes(code)), `la mano: ${ids.join(', ')}`).toBe(true)
  await shot(page, 'visitante-solo-mesa')
})
