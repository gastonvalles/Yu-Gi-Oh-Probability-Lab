import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { OcgCardData } from 'ocgcore-wasm'
import { cardData, type CardRow, type DataSource } from '../../app/auto/auto-data'
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

/** Las filas de `datas` (con el nombre de `texts` y el `ot`) como las sirve la ruta de desarrollo `/auto-data/cards` (vite.config.ts). */
export function cardRows(file = path.join(CORE_DATA_DIR, 'cards.cdb')): (CardRow & { ot: number })[] {
  const db = new DatabaseSync(file, { readOnly: true })
  const rows = db.prepare('select d.id, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, d.ot, t.name from datas d left join texts t on t.id = d.id')

  rows.setReadBigInts(true)
  const out = (rows.all() as Record<string, bigint | string | null>[]).map((row) => ({
    id: Number(row.id),
    alias: Number(row.alias),
    setcode: BigInt.asUintN(64, row.setcode as bigint).toString(),
    type: Number(row.type),
    atk: Number(row.atk),
    def: Number(row.def),
    level: Number(row.level),
    race: BigInt.asUintN(64, row.race as bigint).toString(),
    attribute: Number(row.attribute),
    ot: Number(row.ot),
    ...(typeof row.name === 'string' ? { name: row.name } : {}),
  }))

  db.close()
  return out
}

/** El `.cdb` entero: los datos que pide `cardReader` (con el decodificador del navegador, `cardData`) y los nombres. */
export function loadCards(file = path.join(CORE_DATA_DIR, 'cards.cdb')): { cards: Map<number, OcgCardData>; names: Map<number, string> } {
  const rows = cardRows(file)

  return { cards: new Map(rows.map((row) => [row.id, cardData(row)])), names: new Map(rows.flatMap((row) => (row.name ? [[row.id, row.name] as const] : []))) }
}

/**
 * La fuente de datos de los duelos automáticos sobre las carpetas locales: lo mismo que sirve `vite serve` en `/auto-data` (el
 * manifiesto con las fichas y el rival de relleno: los primeros 40 Monstruos Normales TCG/OCG sin arte alternativo ni script).
 */
export function nodeSource(rows = cardRows(), store = scriptStore()): DataSource {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const tokens = rows.filter((row) => (row.type & 0x4000) !== 0).map((row) => row.id)
  const filler = rows
    .filter((row) => row.type === 0x11 && row.alias === 0 && (row.ot & 3) !== 0 && !store.has(`c${row.id}.lua`))
    .map((row) => row.id)
    .sort((a, b) => a - b)
    .slice(0, 40)

  return {
    manifest: async () => ({ version: 'node', tokens, filler }),
    cards: async (codes) => codes.flatMap((code) => (byId.has(code) ? [byId.get(code)!] : [])),
    script: async (name) => store.read(name),
  }
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
