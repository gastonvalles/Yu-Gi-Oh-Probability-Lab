import { askView, step, type AskGesture, type AskItem, type AskState, type AskView } from '../../app/auto/ask-ui'
import { parseAnswer, type AskOf, type CoreAnswer, type CoreAsk } from '../../app/auto/protocol'

/**
 * El jugador de las pruebas de `ask-ui.ts`: toca lo que la pantalla ofrece (`gesturesOf`: los ítems, las casillas de los dos lados, las cartas
 * elegibles, los contadores, las opciones, Listo y Cancelar), al azar, hasta que la pregunta contesta. Y, escritas aparte de `ask-ui`, las reglas con que
 * el núcleo acepta una respuesta (`legal`, de `playerop.cpp`): la prueba rápida las usa en vez del núcleo.
 */

/** Todo lo que la pantalla deja tocar ahora (nada si la pregunta se contesta sola). */
export function gesturesOf(view: AskView): AskGesture[] {
  if (view.auto) return []
  const out: AskGesture[] = []
  const items = (list: readonly AskItem[]) => {
    for (const item of list) {
      if (item.answer) out.push({ kind: 'item', answer: item.answer })
      if (item.children) items(item.children)
    }
  }

  for (const list of [...view.items.values(), ...view.theirs.values()]) items(list)
  items(view.phaseItems)
  if (view.endTurn) out.push({ kind: 'item', answer: view.endTurn })
  if (view.prompt) out.push({ kind: 'item', answer: view.prompt.yes }, { kind: 'item', answer: view.prompt.no })
  for (const target of view.zonePick?.targets ?? []) out.push({ kind: 'zone', ...target })
  if (view.cardPick) {
    for (const index of view.cardPick.eligible) {
      const ref = view.cardPick.cards[index]!.ref

      out.push(ref ? { kind: 'card', ref } : { kind: 'pick', index })
    }
    if (view.cardPick.done) out.push({ kind: 'done' })
  }
  for (const option of view.options?.options ?? []) out.push({ kind: 'option', value: option.value })
  if (view.sort) {
    view.sort.cards.forEach((_, index) => out.push({ kind: 'pick', index }))
    if (view.sort.done) out.push({ kind: 'done' })
  }
  if (view.counters) {
    const { cards, now, done } = view.counters

    if (done) out.push({ kind: 'done' })
    else cards.forEach((card, index) => {
      if (now[index]! < (card.value ?? 0)) out.push({ kind: 'pick', index })
    })
  }
  if (view.cancelable) out.push({ kind: 'cancel' })

  return out
}

export interface Played {
  answer: CoreAnswer | null
  /** Se contestó sola (y por qué). */
  auto: AskView['auto']
  /** No había nada que tocar, o ni al azar (hasta el tope) ni sumando sin soltar se llegó a contestar. */
  stuck: boolean
  /** Toques ofrecidos que no hicieron nada (tiene que ser 0). */
  dead: number
  taps: number
}

/** Toca al azar lo ofrecido hasta que la pregunta contesta (pasado el tope, sin soltar nada). */
export function playAsk(state: AskState, random: () => number, cap = 400): Played {
  let current = state
  let dead = 0

  for (let taps = 0; taps < cap; taps += 1) {
    const view = askView(current)

    if (view.auto) return { answer: view.auto.answer, auto: view.auto, stuck: false, dead, taps }
    const gestures = gesturesOf(view)

    if (gestures.length === 0) return { answer: null, auto: null, stuck: true, dead, taps }
    const result = step(current, gestures[Math.floor(random() * gestures.length)]!)

    if (result.answer) return { answer: result.answer, auto: null, stuck: false, dead, taps: taps + 1 }
    if (result.state === current) dead += 1
    current = result.state
  }

  // Al tope, sin soltar: lo que contesta o, si no, lo primero que suma. Al azar se suelta tanto como se elige, y elegir casi todas (9 de las
  // 10 de la mano, A Bao A Qu) es una caminata que vuelve atrás: unos 160 toques de media y una cola que pasa los 400, sin que a la pantalla
  // le falte nada.
  for (let taps = cap; ; taps += 1) {
    const results = gesturesOf(askView(current)).map((gesture) => step(current, gesture))
    const answer = results.find((result) => result.answer)?.answer
    const grown = results.find((result) => result.state.chosen.length > current.chosen.length)

    if (answer) return { answer, auto: null, stuck: false, dead, taps: taps + 1 }
    if (!grown) return { answer: null, auto: null, stuck: true, dead, taps }
    current = grown.state
  }
}

/** mulberry32. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a

    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)

    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Claves de duelo (64 hex) fijas para el anfitrión del enlace (`newKey`): cada una gasta un solo número de `random`, como la semilla de antes. */
export function seededKey(random: () => number): () => string {
  return () => {
    const next = seeded(Math.floor(random() * 2 ** 32))

    return Array.from({ length: 8 }, () => Math.floor(next() * 2 ** 32).toString(16).padStart(8, '0')).join('')
  }
}

const distinctIn = (indices: readonly number[], size: number) => new Set(indices).size === indices.length && indices.every((i) => Number.isInteger(i) && i >= 0 && i < size)
const popcount = (mask: bigint) => mask.toString(2).replace(/0/g, '').length

/** `select_sum_check1` del núcleo: cada carta, con su u16 bajo o (si no es 0) el alto; el último tiene que cerrar justo. */
function sumCheck(values: readonly number[], i: number, acc: number): boolean {
  if (acc === 0 || i >= values.length) return false
  const [o1, o2] = [values[i]! & 0xffff, values[i]! >>> 16]

  if (i === values.length - 1) return acc === o1 || acc === o2

  return (acc > o1 && sumCheck(values, i + 1, acc - o1)) || (o2 > 0 && acc > o2 && sumCheck(values, i + 1, acc - o2))
}

/** Si el núcleo acepta esa respuesta a esa pregunta (sin `RETRY`), con sus mismas reglas. `announce_card` sólo se mira por forma (y, si las trae, que sea una de sus `cards`). */
export function legal(ask: CoreAsk, answer: CoreAnswer): boolean {
  if (answer.type !== ask.type || !parseAnswer(answer)) return false
  const a = answer as never

  switch (ask.type) {
    case 'select_idlecmd': {
      const { action, index } = a as Extract<CoreAnswer, { type: 'select_idlecmd' }>
      const lists = [ask.summons, ask.special_summons, ask.pos_changes, ask.monster_sets, ask.spell_sets, ask.activates]

      if (action <= 5) return index !== null && index >= 0 && index < lists[action]!.length
      return (action === 6 && ask.to_bp) || (action === 7 && ask.to_ep) || (action === 8 && ask.shuffle)
    }
    case 'select_battlecmd': {
      const { action, index } = a as Extract<CoreAnswer, { type: 'select_battlecmd' }>

      if (action <= 1) return index !== null && index >= 0 && index < (action === 0 ? ask.chains : ask.attacks).length
      return (action === 2 && ask.to_m2) || (action === 3 && ask.to_ep)
    }
    case 'select_effectyn':
    case 'select_yesno':
      return true
    case 'select_option':
    case 'announce_number': {
      const { index } = a as { index: number }

      return index >= 0 && index < ask.options.length
    }
    case 'select_card':
    case 'select_tribute': {
      const { indices } = a as { indices: number[] | null }

      if (indices === null) return ask.can_cancel
      if (!distinctIn(indices, ask.selects.length)) return false
      if (ask.type === 'select_card') return indices.length >= ask.min && indices.length <= ask.max

      return indices.length <= ask.max && indices.reduce((sum, i) => sum + ask.selects[i]!.release_param, 0) >= ask.min
    }
    case 'select_chain': {
      const { index } = a as { index: number | null }

      return index === null ? !ask.forced : index >= 0 && index < ask.selects.length
    }
    case 'select_place':
    case 'select_disfield': {
      const { places } = a as { places: { player: number; location: number; sequence: number }[] }
      const bits = places.map((place) => (place.player === ask.player ? 0 : 16) + (place.location === 8 ? 8 : 0) + place.sequence)

      return (
        places.length === ask.count &&
        new Set(bits).size === bits.length &&
        places.every((place, i) => (place.location === 4 ? place.sequence <= 6 : place.location === 8 && place.sequence <= 7) && ((ask.field_mask >>> bits[i]!) & 1) === 0)
      )
    }
    case 'select_position': {
      const { position } = a as { position: number }

      return [1, 2, 4, 8].includes(position) && (ask.positions & position) !== 0
    }
    case 'sort_card':
    case 'sort_chain': {
      const { order } = a as { order: number[] | null }

      return order === null || (order.length === ask.cards.length && distinctIn(order, ask.cards.length))
    }
    case 'select_counter': {
      const { counters } = a as { counters: number[] }

      return counters.length === ask.cards.length && counters.every((n, i) => n >= 0 && n <= ask.cards[i]!.count) && counters.reduce((sum, n) => sum + n, 0) === ask.count
    }
    case 'select_sum':
      return sumLegal(ask, (a as { indices: number[] }).indices)
    case 'select_unselect_card': {
      const { index } = a as { index: number | null }

      return index === null ? ask.can_cancel || ask.can_finish : index >= 0 && index < ask.select_cards.length + ask.unselect_cards.length
    }
    case 'announce_race':
    case 'announce_attrib': {
      const chosen = BigInt(ask.type === 'announce_race' ? (a as { races: string }).races : (a as { attributes: number }).attributes)
      const available = BigInt(ask.available)

      return (chosen & ~available) === 0n && popcount(chosen) === ask.count
    }
    case 'announce_card':
      return (a as { code: number }).code > 0 && (ask.cards?.includes((a as { code: number }).code) ?? true)
    case 'rock_paper_scissors':
      return [1, 2, 3].includes((a as { value: number }).value)
  }
}

function sumLegal(ask: AskOf<'select_sum'>, indices: readonly number[]): boolean {
  if (!distinctIn(indices, ask.selects.length)) return false
  const values = [...ask.selects_must.map((card) => card.amount), ...[...indices].sort((x, y) => x - y).map((i) => ask.selects[i]!.amount)]

  if (ask.select_max === 0) return indices.length >= ask.min && indices.length <= ask.max && sumCheck(values, 0, ask.amount)
  let [sum, mx, mn] = [0, 0, Infinity]

  for (const value of values) {
    const [op1, op2] = [value & 0xffff, value >>> 16]
    const o = op2 > 0 && op1 > op2 ? op2 : op1

    sum += o
    mx += op2 > op1 ? op2 : op1
    mn = Math.min(mn, o)
  }

  return mx >= ask.amount && sum - mn < ask.amount
}
