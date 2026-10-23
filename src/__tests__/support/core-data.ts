import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { OcgCardData } from 'ocgcore-wasm'
import type { AutoHost } from '../../app/auto/core-host'
import { mapDeck, type DeckList } from '../../app/auto/deck-map'
import type { Policy } from '../../app/auto/policies'
import type { AutoEvent, CoreAnswer } from '../../app/auto/protocol'

/**
 * Los datos del núcleo en Node, para las pruebas de `src/app/auto/` (nunca entran al repo: el `.cdb` no tiene licencia). Los deja
 * `npm run sync:core`: `cards.cdb` en `CORE_DATA_DIR` y los scripts de Project Ignis en `CARD_SCRIPTS_DIR` (el mismo clon de
 * `sync:effects`). Si faltan, las pruebas que los usan se saltan solas (`hasCoreData`).
 */

export const CORE_DATA_DIR = process.env.CORE_DATA_DIR ?? path.join(os.tmpdir(), 'ygo-lab-core-data')
export const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
export const hasCoreData = existsSync(path.join(CORE_DATA_DIR, 'cards.cdb')) && existsSync(path.join(CARD_SCRIPTS_DIR, 'constant.lua'))

/** El wasm del núcleo (build sync), para pasárselo al anfitrión como `wasmBinary`. */
export function wasmBinary(): ArrayBuffer {
  const file = readFileSync(createRequire(import.meta.url).resolve('ocgcore-wasm/lib/ocgcore.sync.wasm'))

  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

/**
 * El `.cdb` entero: los datos que pide `cardReader` y los nombres. Codificación de YGOPro: `level` = nivel | escala derecha << 16 |
 * izquierda << 24; en los Link, `def` son las flechas; `setcode`, 4 × u16 en un int64.
 */
export function loadCards(file = path.join(CORE_DATA_DIR, 'cards.cdb')): { cards: Map<number, OcgCardData>; names: Map<number, string> } {
  const db = new DatabaseSync(file, { readOnly: true })
  const rows = db.prepare('select d.id, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.name from datas d left join texts t on t.id = d.id')

  rows.setReadBigInts(true)
  const cards = new Map<number, OcgCardData>()
  const names = new Map<number, string>()

  for (const row of rows.all() as Record<string, bigint | string | null>[]) {
    const code = Number(row.id)
    const type = Number(row.type)
    const level = Number(row.level)
    const isLink = (type & 0x4000000) !== 0
    const setcode = BigInt.asUintN(64, row.setcode as bigint)
    const setcodes = [0n, 1n, 2n, 3n].map((i) => Number((setcode >> (i * 16n)) & 0xffffn)).filter((value) => value !== 0)

    cards.set(code, {
      code,
      alias: Number(row.alias),
      setcodes,
      type,
      level: level & 0xff,
      attribute: Number(row.attribute),
      race: BigInt.asUintN(64, row.race as bigint),
      attack: Number(row.atk),
      defense: isLink ? 0 : Number(row.def),
      lscale: (level >>> 24) & 0xff,
      rscale: (level >>> 16) & 0xff,
      link_marker: isLink ? Number(row.def) : 0,
    })
    if (typeof row.name === 'string') names.set(code, row.name)
  }
  db.close()

  return { cards, names }
}

/** Los scripts del clon, con caché: `c<código>.lua` en `official/` y después en `pre-release/`; las bibliotecas, en la raíz y en `unofficial/`. */
export function scriptStore(root = CARD_SCRIPTS_DIR): { read: (name: string) => string | null; has: (name: string) => boolean } {
  const cache = new Map<string, string | null>()
  const read = (name: string) => {
    if (!cache.has(name)) {
      const dirs = /^c\d+\.lua$/.test(name) ? ['official', 'pre-release'] : ['.', 'unofficial']
      const file = dirs.map((dir) => path.join(root, dir, name)).find((candidate) => existsSync(candidate))

      cache.set(name, file ? readFileSync(file, 'utf8') : null)
    }

    return cache.get(name)!
  }

  return { read, has: (name) => read(name) !== null }
}

/** Las listas del meta, ya en códigos del núcleo; sólo las que se pueden automatizar (todas sus cartas en el `.cdb` y con reglas). */
export function metaDecks(cards: Map<number, OcgCardData>, store: { has: (name: string) => boolean }) {
  const lists = JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>

  return Object.entries(lists)
    .map(([id, list]) => ({ id, ...mapDeck(list, (code) => cards.get(code) ?? null, store.has) }))
    .filter((deck) => deck.missing.length === 0 && deck.noRules.length === 0)
}

/**
 * Juega hasta el fin, el tope de preguntas, el tope de tiempo (`budgetMs`: un duelo en el que cada respuesta tarda segundos no cuelga
 * el fuzz) o una pregunta que no llega, contestando con la política de cada asiento lo último que preguntó el anfitrión. `onAnswer` ve
 * cada pregunta (como la recibió el asiento) y su respuesta.
 */
export async function runDuel(host: AutoHost, events: AutoEvent[], policies: [Policy, Policy], cap = 2000, onAnswer?: (ask: Extract<AutoEvent, { t: 'ask' }>, answer: CoreAnswer) => Promise<void> | void, budgetMs = Infinity) {
  const started = performance.now()
  let from = 0
  let questions = 0

  for (;;) {
    const fresh = events.slice(from)

    from = events.length
    const end = fresh.find((event) => event.t === 'end')

    if (end) return { end: 'win' as const, winner: end.winner, questions }
    const ask = fresh.findLast((event) => event.t === 'ask')

    if (!ask) return { end: 'stuck' as const, questions }
    if (questions >= cap) return { end: 'cap' as const, questions }
    if (performance.now() - started > budgetMs) return { end: 'slow' as const, questions }
    questions += 1
    const answer = policies[ask.seat](ask.ask)

    await host.handle({ t: 'answer', askId: ask.askId, answer })
    await onAnswer?.(ask, answer)
  }
}
