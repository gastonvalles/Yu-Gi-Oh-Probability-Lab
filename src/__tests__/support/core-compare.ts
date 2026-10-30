import { OcgLocation as L, OcgQueryFlags as Q, type OcgCoreSync, type OcgDuelHandle } from 'ocgcore-wasm'
import type { Seat } from '../../app/auto/protocol'
import type { MatState, Placed } from '../../app/practice-mat'

/**
 * La mesa proyectada contra el estado real del núcleo (`duelQueryLocation`), para las pruebas lentas de `src/app/auto/`
 * (`auto-adapter.slow.test.ts`, `auto-session.slow.test.ts`): las dos en el mismo formato, y sus diferencias.
 */

const FACEUP = 5
const FACEDOWN = 10
const FLAGS = (Q.CODE | Q.POSITION | Q.COUNTERS | Q.OVERLAY_CARD | Q.ATTACK | Q.DEFENSE) as Q
const PILES = [L.DECK, L.HAND, L.GRAVE, L.REMOVED, L.EXTRA] as const

const sorted = (codes: number[]) => [...codes].sort((a, b) => a - b).join(',')
/**
 * Cuántos contadores tiene la carta (la mesa lleva uno solo, la suma de los tipos). El paquete 0.1.6 decodifica `QUERY_COUNTERS` al revés: el
 * núcleo manda `tipo | cantidad << 16` y queda `{ cantidad: tipo }` (Selene con 11 Contadores de Magia, tipo 1, da `{ 11: 1 }`), así que se suman
 * las claves. ponytail: dos tipos con la misma cantidad comparten clave y uno se pierde; leer el buffer crudo si alguna carta lo necesita.
 */
const counted = (counters: Record<number, number> = {}) => Object.keys(counters).reduce((sum, count) => sum + Number(count), 0)
const posName = (location: number, position: number) => ((position & FACEDOWN) !== 0 ? 'set' : location === L.MZONE && (position & 4) !== 0 ? 'def' : 'atk')

/** Los códigos que lleva un evento (para la regla de que un `reveal` sólo puede decir lo que llegó). */
export function codesIn(value: unknown, out = new Set<number>()): Set<number> {
  if (Array.isArray(value)) value.forEach((item) => codesIn(item, out))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'code' || key === 'card') && typeof item === 'number') out.add(item)
      else if (key === 'cards' && Array.isArray(item) && item.every((x) => typeof x === 'number')) item.forEach((x) => out.add(x as number))
      else codesIn(item, out)
    }
  }

  return out
}

export const codeOfId = (id: string, known: Readonly<Record<string, string>>) => {
  const bare = id.startsWith('f.') ? id.slice(2) : id
  const real = /^card-(\d+)-/.exec(bare) ?? /^card-(\d+)-/.exec(known[bare] ?? '')

  return real ? Number(real[1]) : 0
}

export interface Real {
  piles: Record<number, { code: number; position: number }[]>
  zones: Record<number, ({ code: number; pos: string; counters: number; materials: number[]; attack?: number; defense?: number } | null)[]>
}

export function readReal(lib: OcgCoreSync, handle: OcgDuelHandle, controller: Seat): Real {
  const query = (location: number) => lib.duelQueryLocation(handle, { flags: FLAGS, controller, location: location as never })
  const piles: Real['piles'] = {}
  const zones: Real['zones'] = {}

  for (const location of PILES) piles[location] = query(location).flatMap((card) => (card?.code ? [{ code: card.code, position: card.position ?? 0 }] : []))
  for (const [location, size] of [[L.MZONE, 7], [L.SZONE, 6]] as const) {
    const cards = query(location)

    zones[location] = Array.from({ length: size }, (_, sequence) => {
      const card = cards[sequence]

      return card?.code ? { code: card.code, pos: posName(location, card.position ?? 0), counters: counted(card.counters), materials: card.overlayCards ?? [], attack: card.attack, defense: card.defense } : null
    })
  }

  return { piles, zones }
}

/**
 * Un Xyz con materiales mientras sigue en el Extra: la Invocación Xyz los junta debajo de la carta antes de sacarla, y en ese tramo el núcleo
 * puede preguntar (dónde va, en qué posición). La mesa los guarda en `held` (`practice-mat.ts`) y se compara igual: se cuenta para saber que el
 * tramo se probó.
 */
export function xyzInTransit(lib: OcgCoreSync, handle: OcgDuelHandle): boolean {
  return ([0, 1] as const).some((controller) => lib.duelQueryLocation(handle, { flags: Q.OVERLAY_CARD as Q, controller, location: L.EXTRA }).some((card) => (card?.overlayCards?.length ?? 0) > 0))
}

/** La mesa en el mismo formato que `readReal`; `code` da el código de cada id (0 = no se sabe). */
export function readMat(state: MatState, code: (id: string) => number) {
  const placed = (p: Placed | null) => (p ? { code: code(p.id), pos: p.pos, counters: p.counters, materials: p.materials.map(code) } : null)

  return {
    piles: { [L.DECK]: state.deck.map(code), [L.HAND]: state.hand.map(code), [L.GRAVE]: state.gy.map(code), [L.REMOVED]: state.banished.map(code), [L.EXTRA]: state.extra.map(code) } as Record<number, number[]>,
    facedown: state.banished.filter((id) => state.facedown.includes(id)).map(code),
    extraUp: state.extraUp.map(code),
    zones: { [L.MZONE]: [...state.mz, ...state.emz].map(placed), [L.SZONE]: [...state.st, state.field].map(placed) } as Record<number, ReturnType<typeof placed>[]>,
  }
}

/** Las diferencias entre una mesa y el núcleo: `own` compara todo; si no (el espejo), lo oculto sólo por cantidad y sin códigos equivocados. */
export function compare(real: Real, mat: ReturnType<typeof readMat>, own: boolean): string[] {
  const diffs: string[] = []
  const subset = (known: number[], all: number[]) => {
    const pool = [...all]

    return known.every((code) => code === 0 || (pool.includes(code) && pool.splice(pool.indexOf(code), 1)))
  }

  for (const location of PILES) {
    const codes = real.piles[location]!.map((card) => card.code)
    const seen = mat.piles[location]!
    const name = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.GRAVE]: 'grave', [L.REMOVED]: 'removed', [L.EXTRA]: 'extra' }[location]

    if (codes.length !== seen.length) diffs.push(`${name}:count ${seen.length}≠${codes.length}`)
    else if (location === L.GRAVE || location === L.REMOVED) {
      // En orden (la de arriba se ve); lo boca abajo del rival puede no tener código, pero nunca otro.
      real.piles[location]!.forEach((card, i) => {
        const open = own || location === L.GRAVE || !(card.position & FACEDOWN)

        if (open ? seen[i] !== card.code : seen[i] !== 0 && seen[i] !== card.code) diffs.push(`${name}:order ${i} ${seen[i]}≠${card.code}`)
      })
      const down = real.piles[location]!.filter((card) => card.position & FACEDOWN).length

      if (location === L.REMOVED && mat.facedown.length !== down) diffs.push(`removed:facedown ${mat.facedown.length}≠${down}`)
    } else if (own ? sorted(seen) !== sorted(codes) : !subset(seen, codes)) diffs.push(`${name}:codes [${sorted(seen)}]≠[${sorted(codes)}]`)
    if (location === L.EXTRA) {
      const up = real.piles[location]!.filter((card) => card.position & FACEUP).map((card) => card.code)

      if (sorted(mat.extraUp) !== sorted(up)) diffs.push(`extra:faceup [${sorted(mat.extraUp)}]≠[${sorted(up)}]`)
    }
  }
  for (const location of [L.MZONE, L.SZONE]) {
    real.zones[location]!.forEach((card, sequence) => {
      const seen = mat.zones[location]![sequence] ?? null
      const where = `${location === L.MZONE ? 'mzone' : 'szone'}`

      if (!card || !seen) {
        if (card || seen) diffs.push(`${where}:occupied ${sequence} ${seen?.code ?? '-'}≠${card?.code ?? '-'}`)
        return
      }
      const hidden = !own && card.pos === 'set'

      if (hidden ? seen.code !== 0 && seen.code !== card.code : seen.code !== card.code) diffs.push(`${where}:code ${sequence} ${seen.code}≠${card.code}`)
      if (seen.pos !== card.pos) diffs.push(`${where}:pos ${sequence} ${seen.pos}≠${card.pos}`)
      if (seen.counters !== card.counters) diffs.push(`${where}:counters ${sequence} ${seen.counters}≠${card.counters}`)
      if (sorted(seen.materials) !== sorted(card.materials)) diffs.push(`${where}:materials ${sequence} [${sorted(seen.materials)}]≠[${sorted(card.materials)}]`)
    })
  }

  return diffs
}
