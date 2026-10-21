import { allMatIds, type MatAction, type MatState } from '../../app/practice-mat'

/** Jugadas al azar sobre una mesa (con semilla, para que una falla se repita): las usan las pruebas del espejo y del duelo. */
export function random(seed: number) {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomAction(state: MatState, next: () => number): MatAction {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!
  const ids = allMatIds(state)
  const zone = pick(['mz', 'emz', 'st'] as const)
  const index = Math.floor(next() * (zone === 'emz' ? 2 : 5))
  const pos = pick(['atk', 'def', 'set'] as const)
  const monsters = [...state.mz, ...state.emz].flatMap((placed) => (placed ? [placed.id] : []))
  const seed = Math.floor(next() * 2 ** 32)

  switch (Math.floor(next() * 17)) {
    case 0:
      return { type: 'draw', count: 1 + Math.floor(next() * 3) }
    case 1:
      return { type: 'mill', count: 1 }
    case 2:
      return { type: 'shuffle', seed }
    case 3:
    case 4:
      return { type: 'move', id: pick(ids), to: pick(['deck', 'extra', 'hand', 'gy', 'banished', 'deck-bottom'] as const), faceDown: next() < 0.5, shuffle: next() < 0.2 ? seed : undefined }
    case 5:
    case 6:
    case 7:
      return { type: 'place', id: pick(ids), zone, index, pos }
    case 8:
      return { type: 'position', id: pick(ids), pos }
    case 9:
      return { type: 'counter', id: pick(ids), delta: pick([-1, 1, 2]) }
    case 10:
      return { type: 'token', zone: 'mz', index }
    case 11:
      return monsters.length > 0 ? { type: 'tribute', id: pick(state.hand.length > 0 ? state.hand : ids), tributes: [pick(monsters)], zone: 'mz', index, pos } : { type: 'draw', count: 1 }
    case 12:
      return monsters.length > 0 && state.extra.length > 0
        ? { type: 'summon', id: pick(state.extra), how: pick(['fusion', 'synchro', 'xyz', 'link'] as const), materials: [pick(monsters)], zone: pick(['mz', 'emz'] as const), index: Math.floor(next() * 2), pos: 'atk' }
        : { type: 'draw', count: 1 }
    case 13:
      return { type: 'attach', id: pick(ids), to: pick(monsters.length > 0 ? monsters : ids) }
    case 14:
      return pick<MatAction>([
        { type: 'activate', id: pick(ids) },
        { type: 'activate', id: pick(ids), cost: 'discard' },
        { type: 'activate', id: pick(ids), cost: 'banish' },
        { type: 'activate', id: pick(ids), effect: Math.floor(next() * 4) },
        { type: 'reveal', id: pick(ids) },
        { type: 'declare', id: pick(ids) },
        { type: 'target', id: pick(ids) },
      ])
    case 15: {
      // Un lote: de 1 a 6 cartas distintas, cada una con una parte de las que entran en un lote (las que se mueven van todas al mismo lugar), a veces con el barajado al principio o al final.
      const to = pick(['deck', 'extra', 'hand', 'gy', 'banished', 'deck-bottom'] as const)
      const faceDown = next() < 0.5
      const cards = [...new Set(Array.from({ length: 1 + Math.floor(next() * 6) }, () => pick(ids)))]
      const parts = cards.map((id): MatAction => {
        const kind = Math.floor(next() * 6)

        return kind === 0 ? { type: 'target', id } : kind === 1 ? { type: 'reveal', id } : kind === 2 ? { type: 'attach', id, to: pick(monsters.length > 0 ? monsters : ids) } : { type: 'move', id, to, faceDown }
      })
      const shuffle = next()

      return { type: 'batch', actions: shuffle < 0.25 ? [{ type: 'shuffle', seed }, ...parts] : shuffle < 0.5 ? [...parts, { type: 'shuffle', seed }] : parts }
    }
    default:
      return { type: 'phase', phase: pick(['draw', 'standby', 'main1', 'battle', 'main2', 'end'] as const) }
  }
}
