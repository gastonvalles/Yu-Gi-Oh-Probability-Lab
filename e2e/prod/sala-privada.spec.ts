// La sala privada de la NOCHE (`npm run test:prod:noche`, sólo en la corrida diaria; nunca en el smoke de después de un deploy: `grepInvert` de
// `playwright.prod.config.ts`). Escribe en el relay —la única escritura de todo el QA en producción—: una sola sala privada con el código al azar de
// la app, un solo navegador (el celular), sin reintentos, y siempre cerrada al final (`finally`). Nunca entra un segundo jugador ni se toca una sala ajena.
//
// El relay no anota las privadas en `GET /rooms` (docs/duelo-relay.md): se comprueba que su código no figura.
import { expect, test, type Page } from '@playwright/test'

// Mismo deck sembrado que el smoke: 40 cartas en el Main, el mínimo para abrir un duelo.
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
  roles: [],
  needsReview: false,
})

const main = [
  ...VANILLAS.flatMap(([id, name], index) => Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () => card(id, name, { cardType: 'Normal Monster', frameType: 'normal', race: 'Warrior', attribute: 'EARTH', level: 4, atk: '1500', def: '1000' }))),
  card(53129443, 'Dark Hole', { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  card(44095762, 'Mirror Force', { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
]

const deckState = JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: true, patternsSeedVersion: 1, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: 'Deck QA', main, extra: [], side: [] }, patterns: [] })

// Una sola sala por corrida: ni reintento, ni escritorio (el celular es el diseño más justo).
test.describe.configure({ retries: 0 })

test('@noche una sala privada queda esperando con su código, fuera de la lista pública, y se cierra', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'una sola sala por corrida: sólo en el celular')

  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use
  const context = await browser.newContext({ baseURL, locale: 'es-AR', userAgent, viewport, deviceScaleFactor, isMobile, hasTouch, serviceWorkers: 'block' })
  await context.route('https://db.ygoprodeck.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }))
  await context.addInitScript(
    ({ deck }) => {
      if (localStorage.getItem('ygo-probability-lab:v2')) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      localStorage.setItem('ygo-probability-lab:v2', deck)
    },
    { deck: deckState },
  )
  const page = await context.newPage()
  let created = false

  try {
    // El lobby pide `GET /rooms` al abrir: de ahí sale la dirección del relay, sin adivinarla.
    const lobby = page.waitForResponse((response) => /\/rooms$/.test(new URL(response.url()).pathname))
    await page.goto('/#duel')
    const relayRooms = (await lobby).url()

    await page.getByRole('textbox', { name: 'Tu nombre' }).fill('QA noche')
    await page.getByRole('textbox', { name: 'Tu nombre' }).press('Enter')
    created = true
    await page.getByRole('button', { name: /^Retar a un amigo/ }).click()

    // Quedó esperando al rival, con su código (8 letras y números, el de la dirección), y la conexión con el relay está abierta.
    await expect(page.getByRole('status').filter({ hasText: 'Esperando a tu rival…' })).toBeVisible()
    await expect(page).toHaveURL(/#duel\?room=[A-Za-z0-9]{8}$/)
    const code = /room=([A-Za-z0-9]{8})/.exec(page.url())![1]!
    await expect(page.getByText(`Código: ${code}`)).toBeVisible()
    await expect(page.getByText(/^(Conectando|Reconectando)…$/)).toHaveCount(0)

    // La privada nunca se anota: tras darle tiempo al registro de una pública, su código no está en la lista.
    await page.waitForTimeout(3_000)
    expect(await roomCodes(page, relayRooms), 'códigos de la lista pública (GET /rooms)').not.toContain(code)
  } finally {
    // Aunque algo falle antes: si se llegó a abrir la sala, se cierra por la UI (X → «Cerrar la sala»).
    if (created) await closeRoom(page)
    await context.close()
  }
})

/** Los códigos de la lista pública, leídos desde la página (mismo origen que el sitio: el relay lo acepta). */
async function roomCodes(page: Page, url: string): Promise<string[]> {
  const body = await page.evaluate(async (target) => (await fetch(target)).json() as Promise<{ rooms?: { code: string }[] }>, url)
  return (body.rooms ?? []).map((room) => room.code)
}

/** Cierra la sala por la UI y espera la vuelta al lobby; si la pantalla ya no la muestra, no hay nada que cerrar. */
async function closeRoom(page: Page) {
  const leave = page.getByRole('button', { name: 'Salir', exact: true })
  if (!(await leave.isVisible().catch(() => false))) return
  await leave.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar la sala', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Retar a un amigo/ })).toBeVisible()
  await expect(page).toHaveURL(/#duel$/)
}
