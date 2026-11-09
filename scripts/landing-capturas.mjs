// Regenera las capturas de la landing (`npm run capturas:landing`): salen de la propia app, local, sin arte de cartas.
//   E2E_APP_PORT   puerto de Vite (5211 por defecto).
//   CAPTURAS_OUT   carpeta de salida (por defecto `public/landing`).
// Levanta Vite de este worktree con un relay inexistente (el lobby sale vacío y no se crea ninguna sala), saca cuatro pantallas con
// un iPhone-like de 390x844 a 2x (ancho final 780 px) y las guarda en WebP con `capturas.json` (archivo, ancho, alto). Todo lo que
// sería arte de Konami (`/api/card-image/*`, el dorso, hosts externos) se responde como un rectángulo gris neutro o se corta.
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.E2E_APP_PORT ?? 5211)
const APP = `http://127.0.0.1:${PORT}`
const OUT = path.resolve(root, process.env.CAPTURAS_OUT ?? 'public/landing')
const MAX_BYTES = 60 * 1024

// Un deck de 40: 13 monstruos normales (3 copias, la última 2), una Mágica y una Trampa, todos «starter» para que el Lab mida (la forma de e2e/prod/smoke.spec.ts).
const VANILLAS = [
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
const card = (id, name, extra) => ({
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

// Gris neutro de 1x1 (PNG): el navegador lo estira al tamaño del hueco.
const GRAY_PNG = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#4a4a5e' } }).png().toBuffer()

// Cada captura: la ruta, un elemento concreto que dice «terminó de pintar» y el alto lógico del recorte (entre ~560 y ~760).
const SHOTS = [
  {
    file: 'lab.webp',
    hash: '#probability-lab',
    ready: (page) => page.locator('#probability-lab').getByRole('img', { name: /^Manos buenas: [\d.]+%/ }),
    height: 672,
  },
  {
    file: 'mesa.webp',
    hash: '#solo',
    ready: (page) => page.getByLabel('Puntos de vida de Vos: 8000'),
    before: async (page) => {
      await page.locator('#solo').getByRole('heading', { level: 2, name: 'Probá tu combo' }).waitFor()
      await page.getByRole('button', { name: /^Jugar contra/ }).click()
      await page.getByLabel('Mesa de práctica').waitFor()
      // Recién abierta la mesa carga las reglas de las cartas (un velo): lista cuando aparece la cuenta de salidas y el velo se fue.
      await page.getByText(/^\d+ salidas?$/).first().waitFor()
      await page.getByText(/^Cargando las reglas/).waitFor({ state: 'detached' })
    },
    height: 704,
  },
  {
    file: 'duelo.webp',
    hash: '#duel',
    ready: (page) => page.locator('#duel').getByRole('heading', { level: 2, name: 'En la arena ahora' }),
    height: 700,
  },
  {
    file: 'meta.webp',
    hash: '#meta',
    ready: (page) => page.locator('#meta').getByRole('heading', { level: 2, name: 'Tier list de hand traps' }),
    height: 700,
  },
]

function startVite() {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    env: { ...process.env, VITE_DUEL_RELAY_URL: 'wss://relay.invalid' },
    stdio: 'ignore',
  })
  return child
}

function stopVite(child) {
  if (!child?.pid) return
  // En Windows `kill` deja al árbol vivo: taskkill /T lo baja entero.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

async function waitFor(url, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* todavía no */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Vite no respondió en ${url}`)
}

async function capture() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    reducedMotion: 'reduce',
  })
  const external = []
  await context.route(/^(?!http:\/\/127\.0\.0\.1:)/, (route) => {
    const url = route.request().url()
    external.push(url)
    if (url.startsWith('https://db.ygoprodeck.com/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' })
    return route.abort()
  })
  // Arte de cartas y dorso: gris neutro, nunca la imagen real.
  await context.route(/\/(api\/card-image\/|card-back)/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: GRAY_PNG }))
  await context.addInitScript(
    ({ deck }) => {
      localStorage.setItem('ygo-lab:locale', 'es')
      localStorage.setItem('ygo-lab:mascots', '[]')
      localStorage.setItem('ygo-lab:sounds', 'off')
      localStorage.setItem('ygo-lab:duel-sounds', 'off')
      localStorage.setItem('ygo-probability-lab:v2', deck)
    },
    { deck: deckState },
  )

  const manifest = []
  for (const shot of SHOTS) {
    const page = await context.newPage()
    await page.goto(`${APP}/${shot.hash}`)
    await shot.before?.(page)
    await shot.ready(page).waitFor()
    // Las fuentes y las imágenes, asentadas (la mascota está apagada y no hay toasts: nada flotante a la vista).
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: shot.height } })
    let quality = 78
    let webp = await sharp(png).webp({ quality }).toBuffer()
    while (webp.length > MAX_BYTES && quality > 40) webp = await sharp(png).webp({ quality: (quality -= 4) }).toBuffer()
    if (webp.length > MAX_BYTES) throw new Error(`${shot.file} pesa ${webp.length} B (tope ${MAX_BYTES})`)
    await writeFile(path.join(OUT, shot.file), webp)
    const { width, height } = await sharp(webp).metadata()
    manifest.push({ archivo: shot.file, ancho: width, alto: height })
    console.log(`${shot.file}: ${width}x${height}, ${webp.length} B (calidad ${quality})`)
    await page.close()
  }
  await writeFile(path.join(OUT, 'capturas.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await browser.close()
  console.log(`Pedidos a hosts externos (todos cortados o vacíos): ${external.length}`)
}

const vite = startVite()
const bye = () => stopVite(vite)
process.on('SIGINT', () => (bye(), process.exit(130)))
try {
  await waitFor(APP)
  await capture()
} finally {
  bye()
}
