import type { AskOf, CoreAnswer, CoreAsk, Seat } from './protocol'

/**
 * Quién contesta cuando no contesta una persona (§3.8 del diseño). Las dos son puras y deterministas: `passivePolicy` es el rival que no
 * hace nada (deja jugar tu combo con reglas de verdad) y `randomLegalPolicy` el bot del fuzz (una respuesta legal al azar; nunca un modo
 * para el usuario). Anunciar una carta pide evaluar el filtro del núcleo contra una base de cartas que estas funciones no tienen: lo hace
 * `pickCard`, que pasa quien las usa (en el fuzz, `cardMatchesOpcode` del paquete sobre el `.cdb`); sin él, se anuncia 0 y el núcleo
 * vuelve a preguntar.
 */

export type Policy = (ask: CoreAsk) => CoreAnswer
export type CardPicker = (ask: AskOf<'announce_card'>, random: () => number) => number

const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
const FIELD_ZONES = 4

/** Las casillas libres de una pregunta de casillas (el bit en 0 = libre), como las pide la respuesta: jugador absoluto, lugar y secuencia. */
function freePlaces(ask: AskOf<'select_place' | 'select_disfield'>) {
  const places: { player: Seat; location: number; sequence: number }[] = []

  for (let bit = 0; bit < FIELD_ZONES * 8; bit += 1) {
    if (((ask.field_mask >>> bit) & 1) === 0) {
      places.push({ player: bit < 16 ? ask.player : ((1 - ask.player) as Seat), location: (bit >> 3) % 2 === 0 ? 4 : 8, sequence: bit & 7 })
    }
  }

  return places
}

const bits = (mask: bigint) => Array.from({ length: 64 }, (_, i) => 1n << BigInt(i)).filter((bit) => (mask & bit) !== 0n)

/**
 * SELECT_SUM: los índices de `selects` (los obligatorios van solos) en el orden dado que cumplen la suma. En «al menos» sacar la carta
 * más chica tiene que bajar de `amount` (si no, sobra una). Búsqueda en profundidad con tope. ponytail: tope de 20.000 nodos, alcanza
 * para las sumas del meta; si alguna vez no alcanza, la respuesta vacía la rechaza el núcleo y se ve como `RETRY` en el fuzz.
 */
function sumPick(ask: AskOf<'select_sum'>, order: readonly number[]): number[] {
  const values = (amount: number) => [...new Set([amount & 0xffff, amount >>> 16].filter((value) => value > 0))]
  const atLeast = ask.select_max !== 0
  const max = atLeast ? Infinity : ask.max
  const add = (sums: [number, number][], amount: number) => sums.flatMap(([sum, low]) => values(amount).map((value): [number, number] => [sum + value, Math.min(low, value)]))
  const ok = (sums: [number, number][], count: number) =>
    count >= Math.max(1, ask.min) && count <= max && sums.some(([sum, low]) => (atLeast ? sum >= ask.amount && sum - low < ask.amount : sum === ask.amount))
  let best: number[] | null = null
  let tries = 0
  const search = (from: number, chosen: number[], sums: [number, number][]) => {
    tries += 1
    if (best || tries > 20_000) return
    const count = ask.selects_must.length + chosen.length

    if (ok(sums, count)) {
      best = [...chosen]
      return
    }
    if (count >= max || (atLeast && sums.every(([sum]) => sum >= ask.amount))) return
    for (let i = from; i < order.length && !best; i += 1) {
      search(i + 1, [...chosen, order[i]!], add(sums, ask.selects[order[i]!]!.amount).filter(([sum]) => atLeast || sum <= ask.amount))
    }
  }

  search(0, [], ask.selects_must.reduce((sums, card) => add(sums, card.amount), [[0, Infinity]] as [number, number][]))

  return best ?? []
}

/** Sacrificios: se suman los que valen (`release_param`) hasta llegar a `min`. */
function tributePick(ask: AskOf<'select_tribute'>, order: readonly number[], more: () => boolean): number[] {
  const chosen: number[] = []
  let sum = 0

  for (const i of order) {
    if (sum >= ask.min && (chosen.length >= ask.max || !more())) break
    chosen.push(i)
    sum += ask.selects[i]!.release_param
  }

  return chosen
}

/** Contadores: se sacan `count` repartidos entre las cartas, sin pasar los que tiene cada una. */
function counterPick(ask: AskOf<'select_counter'>, pick: (open: number[]) => number): number[] {
  const counters = ask.cards.map(() => 0)

  for (let left = ask.count; left > 0; left -= 1) {
    const open = ask.cards.map((_, i) => i).filter((i) => counters[i]! < ask.cards[i]!.count)

    if (open.length === 0) break
    counters[pick(open)]! += 1
  }

  return counters
}

/**
 * El rival pasivo: End Phase si puede (si no, Battle Phase y después lo primero que haya); en batalla, End Phase o Main Phase 2; no
 * encadena salvo que sea obligatorio; dice que no; elige las primeras `min`; la primera posición, casilla, opción o número; deja el
 * orden como está.
 */
export function passivePolicy(pickCard?: CardPicker): Policy {
  const first = (n: number) => Array.from({ length: n }, (_, i) => i)

  return (ask) => {
    switch (ask.type) {
      case 'select_idlecmd': {
        if (ask.to_ep) return { type: ask.type, action: 7, index: null }
        if (ask.to_bp) return { type: ask.type, action: 6, index: null }
        const action = IDLE_LISTS.findIndex((key) => ask[key].length > 0)

        return action >= 0 ? { type: ask.type, action, index: 0 } : { type: ask.type, action: 8, index: null }
      }
      case 'select_battlecmd':
        if (ask.to_ep) return { type: ask.type, action: 3, index: null }
        if (ask.to_m2) return { type: ask.type, action: 2, index: null }

        return ask.attacks.length > 0 ? { type: ask.type, action: 1, index: 0 } : { type: ask.type, action: 0, index: 0 }
      case 'select_chain':
        return { type: ask.type, index: ask.forced && ask.selects.length > 0 ? 0 : null }
      case 'select_effectyn':
      case 'select_yesno':
        return { type: ask.type, yes: false }
      case 'select_option':
        return { type: ask.type, index: 0 }
      case 'select_card':
        return { type: ask.type, indices: ask.can_cancel && ask.min === 0 ? null : first(Math.min(ask.min, ask.selects.length)) }
      case 'select_tribute':
        return { type: ask.type, indices: tributePick(ask, first(ask.selects.length), () => false) }
      case 'select_unselect_card':
        if (ask.can_finish) return { type: ask.type, index: null }

        return { type: ask.type, index: ask.select_cards.length > 0 ? 0 : null }
      case 'select_place':
      case 'select_disfield':
        return { type: ask.type, places: freePlaces(ask).slice(0, ask.count) }
      case 'select_position':
        return { type: ask.type, position: [1, 2, 4, 8].find((position) => (ask.positions & position) !== 0) ?? 1 }
      case 'select_counter':
        return { type: ask.type, counters: counterPick(ask, (open) => open[0]!) }
      case 'select_sum':
        return { type: ask.type, indices: sumPick(ask, first(ask.selects.length)) }
      case 'sort_card':
      case 'sort_chain':
        return { type: ask.type, order: null }
      case 'announce_race':
        return { type: ask.type, races: String(bits(BigInt(ask.available)).slice(0, ask.count).reduce((mask, bit) => mask | bit, 0n)) }
      case 'announce_attrib':
        return { type: ask.type, attributes: Number(bits(BigInt(ask.available)).slice(0, ask.count).reduce((mask, bit) => mask | bit, 0n)) }
      case 'announce_card':
        return { type: ask.type, code: pickCard?.(ask, () => 0) ?? 0 }
      case 'announce_number':
        return { type: ask.type, index: 0 }
      case 'rock_paper_scissors':
        return { type: ask.type, value: 1 }
    }
  }
}

/** mulberry32, el mismo generador que `shuffleWithSeed` de la mesa. */
function mulberry32(seed: number) {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** El bot del fuzz: una respuesta legal al azar para cada una de las 21 preguntas, la misma con la misma semilla y las mismas preguntas. */
export function randomLegalPolicy(seed: number, pickCard?: CardPicker): Policy {
  const random = mulberry32(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1))
  const shuffled = (n: number) => {
    const order = Array.from({ length: n }, (_, i) => i)

    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))

      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }

    return order
  }
  const someBits = (available: string, count: number) => {
    const all = bits(BigInt(available))

    return shuffled(all.length)
      .slice(0, count)
      .reduce((mask, i) => mask | all[i]!, 0n)
  }

  return (ask) => {
    switch (ask.type) {
      case 'select_idlecmd': {
        const options: [number, number | null][] = IDLE_LISTS.flatMap((key, action) => ask[key].map((_, index): [number, number | null] => [action, index]))

        if (ask.to_bp) options.push([6, null])
        if (ask.to_ep) options.push([7, null])
        if (ask.shuffle) options.push([8, null])
        const [action, index] = pick(options)

        return { type: ask.type, action, index }
      }
      case 'select_battlecmd': {
        const options: [number, number | null][] = [...ask.chains.map((_, i): [number, number | null] => [0, i]), ...ask.attacks.map((_, i): [number, number | null] => [1, i])]

        if (ask.to_m2) options.push([2, null])
        if (ask.to_ep) options.push([3, null])
        const [action, index] = pick(options)

        return { type: ask.type, action, index }
      }
      case 'select_effectyn':
      case 'select_yesno':
        return { type: ask.type, yes: random() < 0.5 }
      case 'select_option':
        return { type: ask.type, index: between(0, ask.options.length - 1) }
      case 'select_card':
        if (ask.can_cancel && random() < 0.1) return { type: ask.type, indices: null }

        return { type: ask.type, indices: shuffled(ask.selects.length).slice(0, between(ask.min, Math.min(ask.max, ask.selects.length))) }
      case 'select_tribute':
        if (ask.can_cancel && random() < 0.1) return { type: ask.type, indices: null }

        return { type: ask.type, indices: tributePick(ask, shuffled(ask.selects.length), () => random() >= 0.5) }
      case 'select_unselect_card': {
        const options = [...ask.select_cards.map((_, i) => i), ...ask.unselect_cards.map((_, i) => ask.select_cards.length + i)]

        if ((ask.can_finish || ask.can_cancel) && (options.length === 0 || random() < 0.5)) return { type: ask.type, index: null }

        return { type: ask.type, index: pick(options) }
      }
      case 'select_chain': {
        const options: (number | null)[] = ask.selects.map((_, i) => i)

        if (!ask.forced) options.push(null)

        return { type: ask.type, index: pick(options) }
      }
      case 'select_place':
      case 'select_disfield': {
        const free = freePlaces(ask)

        return { type: ask.type, places: shuffled(free.length).slice(0, ask.count).map((i) => free[i]!) }
      }
      case 'select_position':
        return { type: ask.type, position: pick([1, 2, 4, 8].filter((position) => (ask.positions & position) !== 0)) }
      case 'select_counter':
        return { type: ask.type, counters: counterPick(ask, pick) }
      case 'select_sum':
        return { type: ask.type, indices: sumPick(ask, shuffled(ask.selects.length)) }
      case 'sort_card':
      case 'sort_chain':
        return { type: ask.type, order: random() < 0.5 ? null : shuffled(ask.cards.length) }
      case 'announce_race':
        return { type: ask.type, races: String(someBits(ask.available, ask.count)) }
      case 'announce_attrib':
        return { type: ask.type, attributes: Number(someBits(String(ask.available), ask.count)) }
      case 'announce_card':
        return { type: ask.type, code: pickCard?.(ask, random) ?? 0 }
      case 'announce_number':
        return { type: ask.type, index: between(0, ask.options.length - 1) }
      case 'rock_paper_scissors':
        return { type: ask.type, value: between(1, 3) }
    }
  }
}
