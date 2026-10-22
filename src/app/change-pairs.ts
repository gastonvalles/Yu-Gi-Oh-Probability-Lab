import { roleGroupOf, type RoleGroup } from './lab-suggestion'
import type { DeckCardInstance, DeckZone } from './model'
import type { BuildZones } from './saved-builds'

/**
 * «Qué cambiaste» entre A y B, como lo piensa un jugador: en el Main, cada carta que sale con la que entra en su lugar; en el Extra y el Side,
 * qué baja, qué sube y qué sale o entra al deck. Puro y determinista (mismo A y B, mismo resultado), sin DOM ni workers.
 */

const ZONES: readonly DeckZone[] = ['main', 'extra', 'side']

/** Otra zona del deck o afuera: `outside` en una que sale es «sale del deck»; en una que entra, «nueva». */
export type ZonePlace = DeckZone | 'outside'

/** Copias de una carta que pasaron de un lugar a otro. */
export interface CardMove {
  /** Una copia de ejemplo (de A si sale, de B si entra): nombre, imagen, roles. */
  card: DeckCardInstance
  copies: number
  from: ZonePlace
  to: ZonePlace
}

/** Un lado de un cambio del Main, con las copias de esa carta en el Main de A y de B («quedan 2», «ahora son 3», «nueva · 3.ª copia»). */
export interface MainChangeSide {
  card: DeckCardInstance
  /** Adónde va la que sale (`side`: baja al Side; `outside`: sale del deck) o de dónde viene la que entra (`side`: sube del Side; `outside`: nueva). */
  place: 'side' | 'outside'
  copiesA: number
  copiesB: number
}

export interface MainChange {
  /** Estable para el mismo par de decks (sirve de `key` y para pedir su efecto). */
  key: string
  /** La que sale del Main (`null`: entra sin que salga nada). */
  out: MainChangeSide | null
  /** La que entra en su lugar (`null`: sale sin reemplazo). */
  in: MainChangeSide | null
  /** Cuántas copias: «las 2 Purulia por 2 Ghost Ogre» es un solo cambio de 2. */
  copies: number
  /** Alguna de las dos cartas no tiene origen o rol: su efecto no se puede medir todavía (se mide al clasificarla). */
  pending: boolean
}

export interface ZoneChanges {
  zone: DeckZone
  sizeA: number
  sizeB: number
  /** Lo que sale de esta zona (a otra zona o del deck). */
  out: CardMove[]
  /** Lo que entra a esta zona (de otra zona o nuevo). */
  in: CardMove[]
  outCopies: number
  inCopies: number
  /** Las mismas cartas en las dos (se muestra plegado: «igual en las dos»). */
  unchanged: boolean
}

export interface DeckChanges {
  /** A y B tienen las mismas cartas en las mismas zonas. */
  identical: boolean
  /** Los cambios del Main, emparejados (primero los que tienen pareja, después los sueltos). */
  main: MainChange[]
  zones: Record<DeckZone, ZoneChanges>
}

const GROUP_RANK: Record<RoleGroup, number> = { starter: 0, interaction: 1, brick: 2, filler: 3 }

const isUnclassified = (card: DeckCardInstance) => card.origin === null || card.roles.length === 0

function countByZone(deck: BuildZones): Map<number, Record<DeckZone, number>> {
  const counts = new Map<number, Record<DeckZone, number>>()

  for (const zone of ZONES) {
    for (const card of deck[zone]) {
      const entry = counts.get(card.apiCard.ygoprodeckId) ?? { main: 0, extra: 0, side: 0 }
      entry[zone] += 1
      counts.set(card.apiCard.ygoprodeckId, entry)
    }
  }

  return counts
}

function firstInstances(deck: BuildZones): Map<number, DeckCardInstance> {
  const byId = new Map<number, DeckCardInstance>()

  for (const card of [...deck.main, ...deck.side, ...deck.extra]) {
    if (!byId.has(card.apiCard.ygoprodeckId)) {
      byId.set(card.apiCard.ygoprodeckId, card)
    }
  }

  return byId
}

/**
 * Por cada carta, cómo se movieron sus copias: primero Main ↔ Side y Extra ↔ Side (bajar o subir del Side), y lo que sobra sale del deck
 * o es nuevo.
 */
function cardMoves(a: BuildZones, b: BuildZones): CardMove[] {
  const countsA = countByZone(a)
  const countsB = countByZone(b)
  const cardsA = firstInstances(a)
  const cardsB = firstInstances(b)
  const ids = [...new Set([...countsA.keys(), ...countsB.keys()])].sort((left, right) => left - right)
  const moves: CardMove[] = []

  for (const id of ids) {
    const before = countsA.get(id) ?? { main: 0, extra: 0, side: 0 }
    const after = countsB.get(id) ?? { main: 0, extra: 0, side: 0 }
    const delta: Record<DeckZone, number> = { main: after.main - before.main, extra: after.extra - before.extra, side: after.side - before.side }
    const move = (from: ZonePlace, to: ZonePlace, copies: number) => {
      if (copies > 0) {
        // Lo que sale se nombra con la copia de A; lo que entra, con la de B (en B puede tener otra clasificación o arte).
        const card = (to === 'outside' ? cardsA.get(id) : cardsB.get(id)) ?? cardsA.get(id) ?? cardsB.get(id)!
        moves.push({ card, copies, from, to })
      }
    }

    for (const zone of ['main', 'extra'] as const) {
      const down = Math.min(Math.max(0, -delta[zone]), Math.max(0, delta.side))
      move(zone, 'side', down)
      delta[zone] += down
      delta.side -= down

      const up = Math.min(Math.max(0, delta[zone]), Math.max(0, -delta.side))
      move('side', zone, up)
      delta[zone] -= up
      delta.side += up
    }

    for (const zone of ZONES) {
      move(zone, 'outside', Math.max(0, -delta[zone]))
      move('outside', zone, Math.max(0, delta[zone]))
    }
  }

  return moves
}

interface Unit {
  card: DeckCardInstance
  place: 'side' | 'outside'
}

const unitOrder = (left: Unit, right: Unit) =>
  GROUP_RANK[roleGroupOf(left.card) ?? 'filler'] - GROUP_RANK[roleGroupOf(right.card) ?? 'filler'] ||
  left.card.name.localeCompare(right.card.name) ||
  left.card.apiCard.ygoprodeckId - right.card.apiCard.ygoprodeckId ||
  left.place.localeCompare(right.place)

/**
 * Cuánto se parecen la que sale y la que entra: la misma familia (starter, interacción, brick, relleno) pesa más; después, que sea un cambio
 * con el Side (baja una y sube otra) o con afuera (sale una y entra una nueva); y al final, que compartan algún rol.
 */
function affinity(out: Unit, inn: Unit): number {
  const sameGroup = roleGroupOf(out.card) === roleGroupOf(inn.card) ? 4 : 0
  const samePlace = out.place === inn.place ? 2 : 0
  const sharedRole = out.card.roles.some((role) => inn.card.roles.includes(role)) ? 1 : 0

  return sameGroup + samePlace + sharedRole
}

function expand(moves: CardMove[], pick: (move: CardMove) => ZonePlace): Unit[] {
  return moves
    .flatMap((move) => Array.from({ length: move.copies }, () => ({ card: move.card, place: pick(move) === 'side' ? ('side' as const) : ('outside' as const) })))
    .sort(unitOrder)
}

function pairMain(moves: CardMove[], a: BuildZones, b: BuildZones): MainChange[] {
  const outs = expand(moves.filter((move) => move.from === 'main'), (move) => move.to)
  const ins = expand(moves.filter((move) => move.to === 'main'), (move) => move.from)
  const partner = new Map<number, number>()
  const taken = new Set<number>()

  // El par más parecido primero; a igual parecido, el orden de las listas (determinista).
  const candidates = outs
    .flatMap((out, outIndex) => ins.map((inn, inIndex) => ({ outIndex, inIndex, score: affinity(out, inn) })))
    .sort((left, right) => right.score - left.score || left.outIndex - right.outIndex || left.inIndex - right.inIndex)

  for (const { outIndex, inIndex } of candidates) {
    if (!partner.has(outIndex) && !taken.has(inIndex)) {
      partner.set(outIndex, inIndex)
      taken.add(inIndex)
    }
  }

  const mainCopies = (deck: BuildZones, id: number) => deck.main.filter((card) => card.apiCard.ygoprodeckId === id).length
  const sideOf = (unit: Unit): MainChangeSide => ({
    card: unit.card,
    place: unit.place,
    copiesA: mainCopies(a, unit.card.apiCard.ygoprodeckId),
    copiesB: mainCopies(b, unit.card.apiCard.ygoprodeckId),
  })
  const keyOf = (side: MainChangeSide | null) => (side ? `${side.card.apiCard.ygoprodeckId}:${side.place}` : '-')
  const changes = new Map<string, MainChange>()
  const add = (out: Unit | null, inn: Unit | null) => {
    const outSide = out && sideOf(out)
    const inSide = inn && sideOf(inn)
    const key = `${keyOf(outSide)}>${keyOf(inSide)}`
    const current = changes.get(key)

    if (current) {
      current.copies += 1
      return
    }

    changes.set(key, { key, out: outSide, in: inSide, copies: 1, pending: [out, inn].some((unit) => unit !== null && isUnclassified(unit.card)) })
  }

  outs.forEach((out, outIndex) => {
    const inIndex = partner.get(outIndex)

    if (inIndex !== undefined) {
      add(out, ins[inIndex]!)
    }
  })
  outs.forEach((out, outIndex) => {
    if (!partner.has(outIndex)) add(out, null)
  })
  ins.forEach((inn, inIndex) => {
    if (!taken.has(inIndex)) add(null, inn)
  })

  return [...changes.values()]
}

export function pairChanges(a: BuildZones, b: BuildZones): DeckChanges {
  const moves = cardMoves(a, b)
  const zones = Object.fromEntries(
    ZONES.map((zone) => {
      const out = moves.filter((move) => move.from === zone)
      const inn = moves.filter((move) => move.to === zone)
      const copies = (list: CardMove[]) => list.reduce((total, move) => total + move.copies, 0)

      return [zone, { zone, sizeA: a[zone].length, sizeB: b[zone].length, out, in: inn, outCopies: copies(out), inCopies: copies(inn), unchanged: out.length === 0 && inn.length === 0 }]
    }),
  ) as Record<DeckZone, ZoneChanges>

  return { identical: moves.length === 0, main: pairMain(moves, a, b), zones }
}
