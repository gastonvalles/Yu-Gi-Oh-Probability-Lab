// Un duelo 1 vs 1 por enlace de punta a punta: dos navegadores (contextos separados, cada uno con su localStorage) contra el relay
// y la app locales que levanta `playwright.config.ts`. Ana abre la sala y Beto entra por el enlace.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

// Un deck de 40 normales de Nivel 4 o menos (más una Mágica y una Trampa): cualquier mano de apertura tiene algo que invocar.
const VANILLAS: [number, string, string, number, number][] = [
  [43096270, 'Alexandrite Dragon', 'Dragon', 2000, 100],
  [69247929, 'Gene-Warped Warwolf', 'Beast-Warrior', 2000, 100],
  [11091375, 'Luster Dragon', 'Dragon', 1900, 1600],
  [15025844, 'Mystical Elf', 'Spellcaster', 800, 2000],
  [91152256, 'Celtic Guardian', 'Warrior', 1400, 1200],
  [5053103, 'Battle Ox', 'Beast-Warrior', 1700, 1000],
  [13039848, 'Giant Soldier of Stone', 'Rock', 1300, 2000],
  [97590747, 'La Jinn the Mystical Genie of the Lamp', 'Fiend', 1800, 1000],
  [14898066, 'Vorse Raider', 'Beast-Warrior', 1900, 1200],
  [11321183, 'Dark Blade', 'Warrior', 1800, 1500],
  [40374923, 'Mammoth Graveyard', 'Dinosaur', 1200, 800],
  [69140098, 'Gemini Elf', 'Spellcaster', 1900, 900],
  [1184620, 'Kojikocy', 'Warrior', 1500, 1200],
]

const card = (id: number, name: string, extra: Record<string, unknown>) => ({
  name,
  apiCard: { ygoprodeckId: id, description: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, linkValue: null, ...extra },
  origin: 'engine',
  roles: [],
  needsReview: false,
})

const main = [
  ...VANILLAS.flatMap(([id, name, race, atk, def], index) =>
    Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () => card(id, name, { cardType: 'Normal Monster', frameType: 'normal', race, attribute: 'EARTH', level: 4, atk: String(atk), def: String(def) })),
  ),
  card(53129443, 'Dark Hole', { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  card(44095762, 'Mirror Force', { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
]

const deckState = (deckName: string) =>
  JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: true, patternsSeedVersion: 1, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName, main, extra: [], side: [] }, patterns: [] })

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots'

/** Un navegador nuevo para cada jugador (nada compartido), en español, sin mascotas ni sonidos y con su deck en el builder. */
async function player(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.addInitScript(
    ({ deck }) => {
      // Sólo la primera vez: recargar no tiene que pisar lo que la app guardó.
      if (localStorage.getItem('ygo-probability-lab:v2')) return
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      localStorage.setItem('ygo-probability-lab:v2', deck)
    },
    { deck: deckState(`Deck de ${name}`) },
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => console.log(`[${name}] pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[${name}] console.error: ${message.text()}`)
  })
  return page
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

test('duelo 1 vs 1 por enlace, de la sala al resultado', async ({ browser }) => {
  const ana = await player(browser, 'Ana')
  const beto = await player(browser, 'Beto')
  let link = ''
  let summonedByAna = ''

  await test.step('Ana pone su nombre y reta a un amigo', async () => {
    await ana.goto('/#duel')
    await ana.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana')
    // El modo de entrada es el automático (fuera de esta prueba): el duelo por enlace manual se elige en las reglas.
    await ana.getByRole('button', { name: /^Reglas del duelo/ }).click()
    const rules = ana.getByRole('dialog', { name: 'Reglas del duelo' })
    await rules.getByRole('radio', { name: 'Manual' }).click()
    await rules.getByRole('button', { name: 'Guardar reglas' }).click()
    await expect(rules).toBeHidden()
    await ana.getByRole('button', { name: /^Retar a un amigo/ }).click()
    // Una sala manual se puede mirar (la automática todavía no) y no lleva el renglón «Reglas: Automáticas».
    await expect(ana.getByRole('button', { name: 'Copiar enlace para mirar' })).toBeVisible()
    await expect(ana.getByRole('region', { name: 'Reglas' }).getByText('Automáticas')).toHaveCount(0)
    await ana.getByRole('button', { name: 'Copiar enlace', exact: true }).click()
    link = await ana.evaluate(() => navigator.clipboard.readText())
    expect(link).toMatch(/#duel\?room=[A-Za-z0-9]{8}/)
    await shot(ana, '01-ana-sala')
  })

  await test.step('Beto entra por el enlace, sin pasar por el lobby', async () => {
    await beto.goto(link)
    const invited = beto.getByText('Ana te invitó a un duelo')
    const full = beto.getByRole('heading', { name: 'La sala ya está completa' })

    // Hallazgo: en desarrollo (StrictMode) la sala se abre dos veces, con dos `pid` distintos; si el relay atiende la segunda antes de cerrar la primera, la sala está «completa».
    for (let attempt = 1; ; attempt++) {
      await expect(invited.or(full)).toBeVisible()
      if (await invited.isVisible()) break
      finding(`Beto entró por el enlace y vio «La sala ya está completa» (intento ${attempt}); recarga.`)
      await shot(beto, `02-beto-sala-completa-${attempt}`)
      expect(attempt).toBeLessThan(3)
      await beto.reload()
    }

    await beto.getByRole('textbox', { name: 'Tu nombre' }).fill('Beto')
    // El nombre viaja al salir del campo o con Enter, no en cada letra.
    await beto.getByRole('textbox', { name: 'Tu nombre' }).press('Enter')
    await expect(ana.getByRole('region', { name: '¿Quién empieza?' }).getByText('Beto')).toBeVisible()
    await shot(beto, '02-beto-sala')
  })

  await test.step('Se escriben por el chat de la sala', async () => {
    await beto.getByRole('textbox', { name: 'Escribí un mensaje' }).fill('Hola Ana, ¿arrancamos?')
    await beto.getByRole('button', { name: 'Enviar', exact: true }).click()
    await expect(ana.getByRole('log', { name: 'Chat con Beto' }).getByText('Hola Ana, ¿arrancamos?')).toBeVisible()
  })

  await test.step('Los dos están listos, piedra-papel-tijera y Ana va primero', async () => {
    await ana.getByRole('button', { name: 'Estoy listo', exact: true }).click()
    await beto.getByRole('button', { name: 'Estoy listo', exact: true }).click()
    await ana.getByRole('button', { name: 'Piedra, papel o tijera', exact: true }).click()
    await ana.getByRole('button', { name: 'Piedra', exact: true }).click()
    await beto.getByRole('button', { name: 'Tijera', exact: true }).click()
    await ana.getByRole('button', { name: 'Ir primero', exact: true }).click()
    await expect(ana.getByRole('list', { name: 'Mano' })).toBeVisible()
    await expect(beto.getByRole('list', { name: 'Mano' })).toBeVisible()
    await expect(ana.getByRole('heading', { name: 'Vas primero' })).toBeVisible()
    await expect(beto.getByRole('heading', { name: 'Vas segundo' })).toBeVisible()
    await expect(hand(ana)).toHaveCount(5)
    await expect(hand(beto)).toHaveCount(5)
    await expect(rivalHand(ana)).toHaveAccessibleName('Mano del rival: 5')
    await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 5')
    await shot(ana, '03-ana-mesa')
    await shot(beto, '03-beto-mesa')
  })

  await test.step('Turno 1 de Ana: Main Phase 1, invoca y coloca; Beto lo ve en su mesa', async () => {
    await phase(ana, beto, 'Main Phase 1')
    await expect(phaseChip(beto)).toHaveAccessibleName('Fases: Main Phase 1')
    summonedByAna = await playFromHand(ana, 'Invocación Normal', 'Zona de monstruo 1')
    await expect(field(beto, 'rival')).toHaveCount(1)
    await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 4')
    await playFromHand(ana, 'Colocar', 'Zona de monstruo 2')
    await expect(field(beto, 'rival')).toHaveCount(2)
    await expect(field(ana, 'mine')).toHaveCount(2)
    await expect(beto.getByRole('img', { name: /^Rival, Zona de monstruo 1, nivel \d, ATK/ })).toBeVisible()
    await shot(ana, '04-ana-turno1')
    await shot(beto, '04-beto-ve-turno1')
  })

  await test.step('Ana pasa el turno; Beto roba solo', async () => {
    await phase(ana, beto, 'End Phase')
    await ana.getByRole('button', { name: 'Pasar turno', exact: true }).click()
    await letPass(beto)
    await expect(beto.getByText(/^Tu turno · 2/)).toBeVisible()
    await expect(ana.getByText(/^Turno de Beto · 2/)).toBeVisible()
    await expect(hand(beto)).toHaveCount(6)
    await expect(rivalHand(ana)).toHaveAccessibleName('Mano del rival: 6')
    await shot(beto, '05-beto-turno2')
  })

  await test.step('Turno 2 de Beto: invoca, va a la Battle Phase y ataca', async () => {
    await phase(beto, ana, 'Main Phase 1')
    await playFromHand(beto, 'Invocación Normal', 'Zona de monstruo 3')
    await expect(field(ana, 'rival')).toHaveCount(1)
    await phase(beto, ana, 'Battle Phase')
    await field(beto, 'mine').first().click()
    await beto.getByRole('menuitem', { name: 'Atacar', exact: true }).click()
    // El objetivo: el monstruo boca arriba de Ana (el otro está boca abajo).
    await shot(beto, '06-beto-objetivo')
    await clickOrKeyboard(beto.getByRole('menu').getByRole('menuitem', { name: summonedByAna, exact: true }), 'el objetivo del ataque (menú «Atacar»)')
    await expect(ana.getByText(`Beto ataca a ${summonedByAna}`).first()).toBeVisible()
    await shot(ana, '06-ana-la-atacan')
  })

  await test.step('Ana resuelve el combate en su mesa: pierde vidas y manda su monstruo al cementerio', async () => {
    await changeLife(ana, ['1', '0', '0'])
    await expect(lifeOf(beto, 'Ana')).toHaveAccessibleName(/^Puntos de vida de Ana: 7900\./)
    await ana.getByRole('group', { name: 'Zona de monstruo 1', exact: true }).getByRole('button').first().click()
    await ana.getByRole('menuitem', { name: 'Al cementerio', exact: true }).click()
    await expect(beto.getByRole('group', { name: 'GY: 1' })).toBeVisible()
    await expect(field(beto, 'rival')).toHaveCount(1)
    await shot(beto, '07-beto-ve-combate')
  })

  await test.step('Señal, chat y deshacer con permiso', async () => {
    await beto.getByRole('button', { name: 'Pensando…', exact: true }).click()
    await expect(ana.getByRole('button', { name: 'Beto: 🤔. Tocá para cerrar' })).toBeVisible()
    await shot(ana, '08-ana-senal')
    await ana.getByRole('button', { name: 'Beto: 🤔. Tocá para cerrar' }).click()
    await ana.getByRole('textbox', { name: 'Escribí un mensaje' }).fill('Me dolió')
    await ana.getByRole('textbox', { name: 'Escribí un mensaje' }).press('Enter')
    await expect(beto.getByRole('log', { name: 'Chat con Ana' }).getByText('Me dolió')).toBeVisible()

    await phase(beto, ana, 'Main Phase 2')
    await playFromHand(beto, 'Colocar', 'Zona de monstruo 4')
    await expect(field(ana, 'rival')).toHaveCount(2)
    const logBeforeUndo = await logLines(ana)
    await beto.getByRole('button', { name: 'Deshacer', exact: true }).click()
    await ana.getByRole('button', { name: 'Permitir', exact: true }).click()
    await expect(field(beto, 'mine')).toHaveCount(1)
    await expect(field(ana, 'rival')).toHaveCount(1)
    await expect(hand(beto)).toHaveCount(5)
    await expect(rivalHand(ana)).toHaveAccessibleName('Mano del rival: 5')
    lostLines(logBeforeUndo, await logLines(ana), 'Ana, cuando Beto deshace (con su permiso)', 1)
  })

  await test.step('Beto pasa el turno y Ana roba', async () => {
    await phase(beto, ana, 'End Phase')
    await beto.getByRole('button', { name: 'Pasar turno', exact: true }).click()
    await letPass(ana)
    await expect(turnText(ana)).toHaveText(/^Tu turno · 3/)
    await expect(turnText(beto)).toHaveText(/^Turno de Ana · 3/)
    await expect(hand(ana)).toHaveCount(4)
    await expect(rivalHand(beto)).toHaveAccessibleName('Mano del rival: 4')
  })

  await test.step('Beto recarga la página en pleno duelo y la mesa vuelve igual', async () => {
    const before = { beto: await table(beto), ana: await table(ana) }
    const anaLog = await logLines(ana)
    await beto.reload()
    await expect(hand(beto)).toHaveCount(before.beto.hand.length)
    await expect.poll(() => table(beto)).toEqual(before.beto)
    await expect.poll(() => table(ana)).toEqual(before.ana)
    lostLines(anaLog, await logLines(ana), 'Ana, cuando Beto recarga')
    await shot(beto, '09-beto-tras-recargar')
  })

  await test.step('Beto se rinde: el resultado en los dos', async () => {
    await beto.getByRole('button', { name: 'Más opciones', exact: true }).click()
    await beto.getByRole('menu').getByRole('menuitem', { name: /^Rendirme/ }).click()
    await beto.getByRole('alertdialog').getByRole('button', { name: 'Rendirme', exact: true }).click()
    await expect(ana.getByRole('heading', { name: '¡Ganaste!' })).toBeVisible()
    await expect(ana.getByText('Beto se rindió.')).toBeVisible()
    await expect(beto.getByRole('heading', { name: 'Perdiste' })).toBeVisible()
    await expect(beto.getByText('Te rendiste.')).toBeVisible()
    await shot(ana, '10-ana-gano')
    await shot(beto, '10-beto-perdio')
  })

  await test.step('Revancha: elige Beto (perdió) y se reparte de nuevo', async () => {
    await ana.getByRole('button', { name: 'Revancha', exact: true }).click()
    await expect(beto.getByText('Ana quiere la revancha.')).toBeVisible()
    await beto.getByRole('button', { name: 'Revancha', exact: true }).click()
    await beto.getByRole('button', { name: 'Ir primero', exact: true }).click()
    await expect(beto.getByRole('heading', { name: 'Vas primero' })).toBeVisible()
    await expect(ana.getByRole('heading', { name: 'Vas segundo' })).toBeVisible()
    await expect(hand(ana)).toHaveCount(5)
    await expect(hand(beto)).toHaveCount(5)
    await expect(lifeOf(ana, 'Ana')).toHaveAccessibleName(/: 8000\./)
    await expect(field(ana, 'mine')).toHaveCount(0)
    await expect(field(beto, 'rival')).toHaveCount(0)
  })

  await test.step('Ana llega a 0 vidas: pierde, y los dos salen', async () => {
    await changeLife(ana, ['8', '0', '0', '0'])
    await expect(ana.getByRole('heading', { name: 'Perdiste' })).toBeVisible()
    await expect(ana.getByText('Te quedaste sin puntos de vida.')).toBeVisible()
    await expect(beto.getByRole('heading', { name: '¡Ganaste!' })).toBeVisible()
    await expect(beto.getByText('Ana se quedó sin puntos de vida.')).toBeVisible()
    await shot(ana, '11-ana-sin-vidas')
    await shot(beto, '11-beto-gano')
    await leave(ana)
    await expect(beto.getByText(/^Ana se fue: la sala desaparece en/)).toBeVisible()
    await shot(beto, '12-beto-ana-se-fue')
    await leave(beto)
  })
})

/** Las líneas del registro y el chat (el panel de la derecha en escritorio). */
const logLines = (page: Page) => page.getByRole('log', { name: /^Chat con / }).getByRole('listitem').allInnerTexts()

/** Lo que estaba en el registro de `who` y ya no está (salvo las `undone` últimas: una jugada deshecha). */
function lostLines(before: string[], after: string[], who: string, undone = 0) {
  const lost = before.slice(0, before.length - undone).filter((line) => !after.includes(line))
  if (lost.length) finding(`El registro de ${who} perdió líneas: ${lost.map((line) => `«${line.replace(/\s+/g, ' ')}»`).join(', ')}.`)
}

const turnText = (page: Page) => page.getByText(/^(Tu turno|Turno de \S+) · \d+$/)

/** Lo que se ve de la mesa desde `page`: lo que una recarga no tiene que cambiar. */
const table = async (page: Page) => ({
  hand: await hand(page).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
  mine: await field(page, 'mine').count(),
  rival: await field(page, 'rival').count(),
  rivalHand: await rivalHand(page).getAttribute('aria-label'),
  turn: await turnText(page).textContent(),
  phase: await phaseChip(page).getAttribute('aria-label'),
  lives: await page.getByRole('button', { name: /^Puntos de vida de/ }).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
  piles: await page.getByRole('button', { name: /^(Main|Extra|GY|Banish): \d+$/ }).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
})

/** Sale del duelo por la X (con el resultado en pantalla, la de su tarjeta: la última) y vuelve al inicio de Jugar; si pregunta, confirma. */
async function leave(page: Page) {
  await page.getByRole('button', { name: 'Salir del duelo', exact: true }).last().click()
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: /^(Abandonar y perder|Salir)$/ })
  const home = page.getByRole('button', { name: /^Retar a un amigo/ })
  await expect(confirm.or(home)).toBeVisible()
  if (await confirm.isVisible()) await confirm.click()
  await expect(home).toBeVisible()
}

const lifeOf = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Puntos de vida de ${name}:`) })

/** Cambia las vidas propias con la calculadora (se abre tocando las vidas): teclas, «Aplicar: restar…» y cerrar. */
async function changeLife(page: Page, keys: string[]) {
  await page.locator('[data-lp="mine"]').click()
  const pad = page.getByRole('group', { name: 'Teclado' })
  for (const key of keys) await pad.getByRole('button', { name: key, exact: true }).click()
  await page.getByRole('button', { name: /^Aplicar: restar/ }).click()
  // Con las vidas en cero la mesa la cierra sola.
  await page.getByRole('button', { name: 'Cerrar la calculadora' }).click({ timeout: 3_000 }).catch(() => {})
  await expect(page.getByRole('dialog', { name: 'Calculadora de LP' })).toBeHidden()
}

/** Si al rival le preguntan si responde, lo deja pasar. */
async function letPass(page: Page) {
  await page.getByRole('button', { name: 'Dejar pasar' }).click()
}

const finding = (text: string) => {
  test.info().annotations.push({ type: 'hallazgo', description: text })
  console.log(`HALLAZGO: ${text}`)
}

/**
 * Un clic de mouse donde se ve `target`; si lo que recibe el clic en ese punto es otra cosa (algo lo tapa para el puntero aunque se vea encima), es un hallazgo:
 * se anota con lo que tapa y se elige con el teclado (Enter), como podría hacerlo una persona.
 */
async function clickOrKeyboard(target: Locator, what: string) {
  await expect(target).toBeVisible()
  const covering = await target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return hit && !element.contains(hit) ? `<${hit.tagName.toLowerCase()} class="${hit.className}">` : null
  })
  if (!covering) return target.click()
  finding(`Un clic en ${what} no le llega: en ese punto lo recibe ${covering} (se eligió con Enter).`)
  await target.press('Enter')
}

const hand = (page: Page) => page.getByRole('list', { name: 'Mano', exact: true }).getByRole('listitem')
const rivalHand = (page: Page) => page.getByRole('img', { name: /^Mano del rival/ })
const phaseChip = (page: Page) => page.getByRole('button', { name: /^Fases:/ })

/** Las cartas en el campo (zonas de monstruo, de magia y trampa, de campo y extra) de un lado, vistas desde `page`. */
const field = (page: Page, side: 'mine' | 'rival') =>
  side === 'mine' ? page.locator('[role=group][aria-label^="Zona"] [data-card-id]') : page.locator('[role=group][aria-label^="Rival, Zona"] [data-rival-card-id]')

/** Pasar de fase le pregunta al rival si va a hacer algo: el rival lo deja pasar. */
async function phase(page: Page, rival: Page, name: string) {
  await phaseChip(page).click()
  await page.getByRole('menuitem', { name: new RegExp(`^(Ir a |Fase actual: )?${name}`) }).click()
  await letPass(rival)
  await expect(phaseChip(page)).toHaveAccessibleName(`Fases: ${name}`)
}

/** Juega el primer monstruo de la mano con `action` en la zona `zone` y devuelve cuál era. */
async function playFromHand(page: Page, action: string, zone: string): Promise<string> {
  const first = hand(page).and(page.locator(':not([aria-label="Dark Hole"]):not([aria-label="Mirror Force"])')).first()
  const name = (await first.getAttribute('aria-label')) ?? ''
  await first.click()
  await page.getByRole('menuitem', { name: action }).click()
  await page.getByRole('button', { name: `${zone}: elegir` }).click()
  return name
}
