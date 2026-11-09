// Antes de cada build escribe dos archivos chicos:
// - `public/build.json`: el commit que se está publicando. Lo leen el QA de producción (para esperar a que el sitio sirva el commit mergeado) y, más adelante, el
//   formulario de bugs. Vercel pasa `VERCEL_GIT_COMMIT_SHA`; en local sale de git y, si no hay, queda «local».
// - `src/data/landing-stats.json`: las cifras de «Lo más jugado del meta» de «Inicio» (decks TCG de las últimas semanas, banlist vigente, día de los precios y las seis
//   cartas que más de esos decks llevan), las mismas que muestran Decks de torneo, Banlists y Expansiones, sin meter sus JSON grandes en «Inicio». No se sube: sin
//   build, el bloque no sale.
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

  const tcg = metaDecks.decks.filter((deck) => deck.region === 'tcg')
  // En cuántos de esos decks está cada carta del Main (una vez por deck, lleve las copias que lleve); a igual cuenta, el orden de aparición.
  const decksWith = new Map()

  for (const deck of tcg) for (const id of new Set(deck.main.map(([cardId]) => cardId))) decksWith.set(id, (decksWith.get(id) ?? 0) + 1)

  return {
    tcgDecks: tcg.length,
    weeks: Math.ceil(metaDecks.windowDays / 7),
    banlist: active?.date ?? '',
    prices: prices.updated,
    topCards: [...decksWith]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, decks]) => ({ id, name: metaDecks.cards?.[id]?.name ?? String(id), decks })),
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
