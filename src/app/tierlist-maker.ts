/**
 * Las tier lists propias: filas (tiers) con un nombre y un color, las cartas repartidas entre ellas y una bandeja de «sin clasificar». Todo vive en el navegador (`localStorage`, `ygo-lab:tierlists`),
 * versionado y leído con tolerancia (como `migrateSavedBuild`): lo que no se entiende se descarta y lo demás se conserva. Este módulo es puro (sin React ni DOM): lo prueban `tierlist-maker.test.ts`.
 */

export const TIERLIST_STORAGE_KEY = 'ygo-lab:tierlists'
export const TIERLIST_VERSION = 1
export const MAX_LISTS = 20
export const MAX_TIERS = 12
export const MAX_CARDS = 300
export const MAX_LABEL = 14
export const MAX_TITLE = 60

/** Los colores de las filas: los clásicos de las tier lists (la S roja, la F violeta) más un verde menta. */
export const TIER_PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffbf', '#7fbfff', '#ff7fff'] as const

/** Las filas con las que arranca una lista: S a F, como la tier list de siempre. */
const DEFAULT_TIERS: ReadonlyArray<readonly [string, string]> = [
  ['S', TIER_PALETTE[0]],
  ['A', TIER_PALETTE[1]],
  ['B', TIER_PALETTE[2]],
  ['C', TIER_PALETTE[3]],
  ['D', TIER_PALETTE[4]],
  ['E', TIER_PALETTE[6]],
  ['F', TIER_PALETTE[7]],
]

export interface MakerCard {
  id: number
  name: string
  image: string | null
}

export interface MakerTier {
  id: string
  label: string
  color: string
  cards: number[]
}

export interface MakerList {
  id: string
  title: string
  tiers: MakerTier[]
  /** Las cartas que todavía no están en ninguna fila. */
  pool: number[]
  cards: Record<number, MakerCard>
}

export interface MakerStore {
  version: typeof TIERLIST_VERSION
  activeId: string
  lists: MakerList[]
}

/** Dónde está (o va) una carta: en una fila, o en la bandeja. */
export type Place = { kind: 'pool' } | { kind: 'tier'; id: string }

let counter = 0

/** Un id corto y único en este navegador (no sale de la red ni hace falta que sea secreto). */
export function newId(): string {
  counter += 1

  return `${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function newList(title: string, id: string = newId()): MakerList {
  return { id, title: title.slice(0, MAX_TITLE), tiers: DEFAULT_TIERS.map(([label, color]) => ({ id: newId(), label, color, cards: [] })), pool: [], cards: {} }
}

export function newStore(title: string): MakerStore {
  const list = newList(title)

  return { version: TIERLIST_VERSION, activeId: list.id, lists: [list] }
}

export const countCards = (list: MakerList): number => Object.keys(list.cards).length

/** Dónde está una carta; null si no es de la lista. */
export function placeOf(list: MakerList, cardId: number): Place | null {
  if (list.pool.includes(cardId)) return { kind: 'pool' }

  const tier = list.tiers.find((candidate) => candidate.cards.includes(cardId))

  return tier ? { kind: 'tier', id: tier.id } : null
}

/** Las cartas nuevas van a la bandeja (las que ya estaban se ignoran) hasta el tope de la lista. */
export function addCards(list: MakerList, incoming: readonly MakerCard[]): MakerList {
  const cards = { ...list.cards }
  const pool = [...list.pool]

  for (const card of incoming) {
    if (cards[card.id] || Object.keys(cards).length >= MAX_CARDS) continue

    cards[card.id] = { id: card.id, name: card.name, image: card.image }
    pool.push(card.id)
  }

  return { ...list, cards, pool }
}

function without(list: MakerList, cardId: number): MakerList {
  return { ...list, pool: list.pool.filter((id) => id !== cardId), tiers: list.tiers.map((tier) => (tier.cards.includes(cardId) ? { ...tier, cards: tier.cards.filter((id) => id !== cardId) } : tier)) }
}

/** Pone la carta en una fila o en la bandeja, antes de la carta `before` si se la nombra (y está ahí) y al final si no. Una carta que no es de la lista no se mueve. */
export function moveCard(list: MakerList, cardId: number, to: Place, before?: number): MakerList {
  // Soltar una carta sobre sí misma no la mueve.
  if (!list.cards[cardId] || before === cardId) return list
  if (to.kind === 'tier' && !list.tiers.some((tier) => tier.id === to.id)) return list

  const rest = without(list, cardId)
  const insert = (ids: number[]): number[] => {
    const at = before === undefined ? -1 : ids.indexOf(before)

    return at === -1 ? [...ids, cardId] : [...ids.slice(0, at), cardId, ...ids.slice(at)]
  }

  if (to.kind === 'pool') return { ...rest, pool: insert(rest.pool) }

  return { ...rest, tiers: rest.tiers.map((tier) => (tier.id === to.id ? { ...tier, cards: insert(tier.cards) } : tier)) }
}

/** Saca la carta de la lista. */
export function removeCard(list: MakerList, cardId: number): MakerList {
  const rest = without(list, cardId)
  const cards = { ...rest.cards }

  delete cards[cardId]

  return { ...rest, cards }
}

/** Todas las cartas vuelven a la bandeja (las filas quedan vacías, con su nombre y su color). */
export function resetPlacements(list: MakerList): MakerList {
  const ranked = list.tiers.flatMap((tier) => tier.cards)

  return { ...list, pool: [...list.pool, ...ranked], tiers: list.tiers.map((tier) => ({ ...tier, cards: [] })) }
}

/** Una fila nueva al final, con el siguiente color de la paleta. */
export function addTier(list: MakerList, label: string): MakerList {
  if (list.tiers.length >= MAX_TIERS) return list

  const color = TIER_PALETTE[list.tiers.length % TIER_PALETTE.length] ?? TIER_PALETTE[0]

  return { ...list, tiers: [...list.tiers, { id: newId(), label: label.trim().slice(0, MAX_LABEL), color, cards: [] }] }
}

export function updateTier(list: MakerList, tierId: string, patch: Partial<Pick<MakerTier, 'label' | 'color'>>): MakerList {
  return {
    ...list,
    tiers: list.tiers.map((tier) =>
      tier.id === tierId
        ? { ...tier, label: patch.label === undefined ? tier.label : patch.label.slice(0, MAX_LABEL), color: patch.color ?? tier.color }
        : tier,
    ),
  }
}

/** Sube (-1) o baja (+1) una fila un lugar; en las puntas no hace nada. */
export function moveTier(list: MakerList, tierId: string, delta: -1 | 1): MakerList {
  const from = list.tiers.findIndex((tier) => tier.id === tierId)
  const to = from + delta

  if (from === -1 || to < 0 || to >= list.tiers.length) return list

  const tiers = [...list.tiers]
  const [moved] = tiers.splice(from, 1)

  if (moved) tiers.splice(to, 0, moved)

  return { ...list, tiers }
}

/** Borra una fila: sus cartas no se pierden, vuelven a la bandeja. */
export function removeTier(list: MakerList, tierId: string): MakerList {
  const tier = list.tiers.find((candidate) => candidate.id === tierId)

  if (!tier) return list

  return { ...list, pool: [...list.pool, ...tier.cards], tiers: list.tiers.filter((candidate) => candidate.id !== tierId) }
}

// ---- Lo guardado ----

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

function parseCard(value: unknown): MakerCard | null {
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== 'string' || value.name === '') return null

  return { id: value.id, name: value.name.slice(0, 120), image: typeof value.image === 'string' && value.image.startsWith('https://') ? value.image : null }
}

function parseList(value: unknown): MakerList | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '' || !Array.isArray(value.tiers)) return null

  const cards: Record<number, MakerCard> = {}

  if (isRecord(value.cards)) {
    for (const raw of Object.values(value.cards)) {
      const card = parseCard(raw)

      if (card && Object.keys(cards).length < MAX_CARDS) cards[card.id] = card
    }
  }

  // Cada carta está en un solo lugar: la primera vez que aparece manda; las que no están en ningún lado vuelven a la bandeja.
  const seen = new Set<number>()
  const keep = (ids: unknown): number[] =>
    (Array.isArray(ids) ? ids : []).filter((id): id is number => {
      if (!isId(id) || !cards[id] || seen.has(id)) return false

      seen.add(id)

      return true
    })

  const tiers: MakerTier[] = value.tiers.slice(0, MAX_TIERS).flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.label !== 'string') return []

    return [{ id: raw.id, label: raw.label.slice(0, MAX_LABEL), color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : TIER_PALETTE[0], cards: keep(raw.cards) }]
  })
  const pool = keep(value.pool)

  for (const id of Object.keys(cards).map(Number)) if (!seen.has(id)) pool.push(id)

  return { id: value.id, title: typeof value.title === 'string' ? value.title.slice(0, MAX_TITLE) : '', tiers, pool, cards }
}

/** Lo guardado, leído con tolerancia. Sin nada (o con algo que no es de acá) arranca una lista nueva con ese título. */
export function parseStore(raw: string | null, fallbackTitle: string): MakerStore {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null

    if (isRecord(data) && data.version === TIERLIST_VERSION && Array.isArray(data.lists)) {
      const lists = data.lists.slice(0, MAX_LISTS).map(parseList).filter((list): list is MakerList => list !== null)
      const first = lists[0]

      if (first) return { version: TIERLIST_VERSION, activeId: lists.some((list) => list.id === data.activeId) ? String(data.activeId) : first.id, lists }
    }
  } catch {
    // Un guardado roto no tira la pantalla: se empieza de cero.
  }

  return newStore(fallbackTitle)
}

export function readStore(fallbackTitle: string): MakerStore {
  try {
    return parseStore(localStorage.getItem(TIERLIST_STORAGE_KEY), fallbackTitle)
  } catch {
    return newStore(fallbackTitle)
  }
}

export function writeStore(store: MakerStore): void {
  try {
    localStorage.setItem(TIERLIST_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Sin lugar (o sin almacenamiento) la lista sigue en pantalla; sólo no se recuerda.
  }
}
