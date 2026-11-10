// Las capturas de la ventana de instalación de Chrome en el celular (`screenshots` de `public/site.webmanifest`): angostas, todas del mismo
// tamaño, sin arte de Konami (el pedido de las imágenes de las cartas se corta y se ven sus iniciales) y con un deck de mentira.
// Uso: `npm run dev` en otra terminal y después `npm run capturas:pwa` (otra dirección: `PWA_BASE_URL=http://127.0.0.1:5221`).
import { chromium } from '@playwright/test'

const BASE = process.env.PWA_BASE_URL ?? 'http://localhost:5173'
const OUT = 'public/pwa'

/** El archivo y el hash de cada una; si cambia un archivo, se cambia también en el manifest. */
const SHOTS = [
  { file: 'inicio', hash: '#inicio' },
  { file: 'laboratorio', hash: '#probability-lab' },
  { file: 'calculadora-lp', hash: '#life' },
  { file: 'jugar-solo', hash: '#solo' },
]

// 40 normales sin imagen (como `e2e/duelo-1v1.spec.ts`).
const VANILLAS = [
  [43096270, 'Alexandrite Dragon', 'Dragon'],
  [69247929, 'Gene-Warped Warwolf', 'Beast-Warrior'],
  [11091375, 'Luster Dragon', 'Dragon'],
  [15025844, 'Mystical Elf', 'Spellcaster'],
  [91152256, 'Celtic Guardian', 'Warrior'],
  [5053103, 'Battle Ox', 'Beast-Warrior'],
  [13039848, 'Giant Soldier of Stone', 'Rock'],
  [97590747, 'La Jinn the Mystical Genie of the Lamp', 'Fiend'],
  [14898066, 'Vorse Raider', 'Beast-Warrior'],
  [11321183, 'Dark Blade', 'Warrior'],
  [40374923, 'Mammoth Graveyard', 'Dinosaur'],
  [69140098, 'Gemini Elf', 'Spellcaster'],
  [1184620, 'Kojikocy', 'Warrior'],
]

// Con roles: el Lab mide en vez de pedir que se clasifiquen.
const card = (id, name, roles, extra) => ({
  name,
  apiCard: { ygoprodeckId: id, description: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, linkValue: null, ...extra },
  origin: 'engine',
  roles,
  needsReview: false,
})

const main = [
  ...VANILLAS.flatMap(([id, name, race], index) =>
    Array.from({ length: index === VANILLAS.length - 1 ? 2 : 3 }, () =>
      card(id, name, [index < 9 ? 'starter' : 'extender'], { cardType: 'Normal Monster', frameType: 'normal', race, attribute: 'EARTH', level: 4, atk: '1800', def: '1000' }),
    ),
  ),
  card(53129443, 'Dark Hole', ['boardbreaker'], { cardType: 'Spell Card', frameType: 'spell', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
  card(44095762, 'Mirror Force', ['disruption'], { cardType: 'Trap Card', frameType: 'trap', race: 'Normal', attribute: null, level: null, atk: null, def: null }),
]

const deck = JSON.stringify({ version: 16, handSize: 5, deckFormat: 'unlimited', patternsSeeded: true, patternsSeedVersion: 1, disabledGenericRuleIds: [], systemRuleNames: {}, deckBuilder: { deckName: 'Deck de prueba', main, extra: [], side: [] }, patterns: [] })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'es-AR' })

await context.addInitScript((saved) => {
  localStorage.setItem('ygo-lab:locale', 'es')
  localStorage.setItem('ygo-lab:mascots', '[]')
  localStorage.setItem('ygo-lab:sounds', 'off')
  localStorage.setItem('ygo-probability-lab:v2', saved)
}, deck)
await context.route('**/api/card-image/**', (route) => route.abort())
await context.route('https://images.ygoprodeck.com/**', (route) => route.abort())

const page = await context.newPage()

for (const { file, hash } of SHOTS) {
  await page.goto(`${BASE}/${hash}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${file}.jpg`, type: 'jpeg', quality: 75 })
  console.log(`${OUT}/${file}.jpg`)
}

await browser.close()
