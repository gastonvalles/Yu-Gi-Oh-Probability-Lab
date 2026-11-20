// Lo que comparten los E2E del duelo por enlace (manual y automático): el deck sembrado, un navegador por jugador y cómo se lee la mesa.
import type { Browser, Page } from '@playwright/test'

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
export async function player(browser: Browser, name: string): Promise<Page> {
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

export const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

export const hand = (page: Page) => page.getByRole('list', { name: 'Mano', exact: true }).getByRole('listitem')
export const rivalHand = (page: Page) => page.getByRole('img', { name: /^Mano del rival/ })
export const phaseChip = (page: Page) => page.getByRole('button', { name: /^Fases:/ })

/** Las cartas en el campo (zonas de monstruo, de magia y trampa, de campo y extra) de un lado, vistas desde `page`. */
export const field = (page: Page, side: 'mine' | 'rival') =>
  side === 'mine' ? page.locator('[role=group][aria-label^="Zona"] [data-card-id]') : page.locator('[role=group][aria-label^="Rival, Zona"] [data-rival-card-id]')
