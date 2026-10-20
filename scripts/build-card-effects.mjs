#!/usr/bin/env node
/**
 * Capa 1 del motor de cartas (docs/motor-de-cartas.md): los hechos de los efectos de cada carta que **su script de EDOPro y su texto dicen los dos** (src/app/card-effect-facts.ts), en
 * src/data/card-effects.json. Agrupado por valor de bits (como card-rules.json): pesa menos y el diff se lee.
 *
 * Hace falta el texto de todas las cartas (YGOPRODeck, una sola pedida) y los scripts de Project Ignis (un clon superficial en una carpeta temporal; CARD_SCRIPTS_DIR la cambia). Se corre a mano
 * cuando conviene refrescarlo (salen cartas nuevas con efectos): `npm run sync:effects`. No forma parte del sync diario.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createServer } from 'vite'

const CARD_SCRIPTS_REPO = 'https://github.com/ProjectIgnis/CardScripts.git'
const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
const CARD_SCRIPT_DIRS = ['official', 'pre-release']
const CARDINFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/card-effects.json')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'

async function main() {
  const scripts = syncCardScripts()
  const cards = await fetchCards()
  const engine = await loadEngine()

  try {
    const { EFFECT_FACT, scriptEffectFacts, textEffectFacts } = engine.facts
    const names = Object.keys(EFFECT_FACT)
    const groups = new Map()
    // Por hecho: cuántas cartas confirman los dos (ST), cuántas sólo el script (St) y cuántas sólo el texto (sT).
    const stats = Object.fromEntries(names.map((name) => [name, { both: 0, scriptOnly: 0, textOnly: 0 }]))
    let withScript = 0
    let verified = 0

    for (const dir of CARD_SCRIPT_DIRS) {
      const folder = path.join(scripts.dir, dir)

      for (const file of readdirSync(folder)) {
        const id = Number(/^c(\d+)\.lua$/.exec(file)?.[1])
        const card = cards.get(id)

        if (!card) continue

        const script = scriptEffectFacts(readFileSync(path.join(folder, file), 'utf8'))

        if (script === 0) continue

        withScript += 1
        const text = textEffectFacts(card.desc)
        const facts = script & text

        for (const name of names) {
          const bit = EFFECT_FACT[name]
          const entry = stats[name]

          if (script & bit && text & bit) entry.both += 1
          else if (script & bit) entry.scriptOnly += 1
          else if (text & bit) entry.textOnly += 1
        }

        if (facts === 0) continue

        verified += 1
        groups.set(facts, [...(groups.get(facts) ?? []), id])
      }
    }

    const entries = [...groups].sort((left, right) => left[0] - right[0]).map(([facts, ids]) => [String(facts), ids.sort((left, right) => left - right)])
    const lines = entries.map(([facts, ids]) => `    ${JSON.stringify(facts)}: ${JSON.stringify(ids)}`)

    writeFileSync(OUTPUT_PATH, `{\n  "scripts": ${JSON.stringify(scripts.commit)},\n  "cards": {\n${lines.join(',\n')}\n  }\n}\n`)
    console.log(`${verified} de ${withScript} cartas con hechos en el script llevan al menos uno confirmado por el texto (${OUTPUT_PATH}).`)
    console.table(stats)
  } finally {
    await engine.close()
  }
}

/** Clona los scripts, o los pone al día si ya están, y devuelve la carpeta y el commit. */
function syncCardScripts() {
  const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim()

  if (existsSync(path.join(CARD_SCRIPTS_DIR, '.git'))) {
    git('-C', CARD_SCRIPTS_DIR, 'fetch', '-q', '--depth', '1', 'origin', 'master')
    git('-C', CARD_SCRIPTS_DIR, 'reset', '-q', '--hard', 'FETCH_HEAD')
  } else {
    git('clone', '-q', '--depth', '1', '--single-branch', '--branch', 'master', CARD_SCRIPTS_REPO, CARD_SCRIPTS_DIR)
  }

  const commit = git('-C', CARD_SCRIPTS_DIR, 'rev-parse', '--short', 'HEAD')
  console.log(`Scripts de EDOPro ${commit} en ${CARD_SCRIPTS_DIR}`)

  return { dir: CARD_SCRIPTS_DIR, commit }
}

/** El texto de todas las cartas por su número (`id`): una sola pedida a YGOPRODeck, sin parámetros (con `misc=no` da 400). */
async function fetchCards() {
  const response = await fetch(CARDINFO_URL, { headers: { 'User-Agent': USER_AGENT } })

  if (!response.ok) throw new Error(`YGOPRODeck respondió ${response.status}`)

  const { data } = await response.json()

  if (!Array.isArray(data) || data.length < 10000) throw new Error('La respuesta de YGOPRODeck no trae el catálogo entero')

  return new Map(data.map((card) => [card.id, { name: card.name, desc: String(card.desc ?? '') }]))
}

/** El lector de scripts y el segmentador de texto son TypeScript de la app: Vite los carga sin compilarlos aparte. */
async function loadEngine() {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  })

  try {
    return { facts: await server.ssrLoadModule('/src/app/card-effect-facts.ts'), close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
