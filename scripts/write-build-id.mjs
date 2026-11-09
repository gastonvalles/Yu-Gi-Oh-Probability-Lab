// Antes de cada build escribe dos archivos chicos:
// - `public/build.json`: el commit que se está publicando. Lo leen el QA de producción (para esperar a que el sitio sirva el commit mergeado) y, más adelante, el
//   formulario de bugs. Vercel pasa `VERCEL_GIT_COMMIT_SHA`; en local sale de git y, si no hay, queda «local».
// - `src/data/landing-stats.json`: las cifras de «El meta» de la landing (decks TCG de las últimas semanas, banlist vigente y día de los precios), las mismas que
//   muestran Decks de torneo, Banlists y Expansiones, sin meter sus JSON grandes en la landing. No se sube: sin build, la landing dice las frases sin cifra.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function sha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

/** Las cuentas de `meta.ts` (`filterMetaDecks` por región, `windowDays`) y `banlists.ts` (`activeBanlist`), en JS plano: el test de paridad las compara. */
export function landingStats({ metaDecks, banlists, prices, today = new Date().toISOString().slice(0, 10) }) {
  const tcgLists = banlists.lists.filter((list) => list.region === 'tcg').reverse()
  const active = tcgLists.find((list) => (list.date.length > 7 ? list.date : `${list.date}-01`) <= today)

  return {
    tcgDecks: metaDecks.decks.filter((deck) => deck.region === 'tcg').length,
    weeks: Math.ceil(metaDecks.windowDays / 7),
    banlist: active?.date ?? '',
    prices: prices.updated,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))

  writeFileSync(new URL('../public/build.json', import.meta.url), `${JSON.stringify({ sha: sha(), builtAt: new Date().toISOString() })}\n`)
  writeFileSync(
    new URL('../src/data/landing-stats.json', import.meta.url),
    `${JSON.stringify(landingStats({ metaDecks: read('../src/data/meta-decks.json'), banlists: read('../src/data/banlists.json'), prices: read('../public/prices/index.json') }))}\n`,
  )
}
