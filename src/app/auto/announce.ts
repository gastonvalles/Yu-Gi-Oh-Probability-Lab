import type { OcgCardData } from 'ocgcore-wasm'
import type { ApiCardSearchResult } from '../../ygoprodeck/types'
import { cardData, rowOfApiCard } from './auto-data'

/**
 * Declarar el nombre de cualquier carta (`announce_card`): además de las que el anfitrión ofrece (las que este asiento vio y las de su deck), el catálogo del armador (YGOPRODeck), que
 * se busca por nombre y nunca se sugiere entero (no dice nada del deck del rival). Los nombres de las cartas sólo existen en inglés (`docs/i18n.md`): se compara sin mayúsculas ni tildes.
 * El filtro de la carta (los `opcodes`) se evalúa con los datos que da el catálogo; uno que mira arquetipos (`setcode`, que el catálogo no trae) no se puede juzgar acá, así que entonces
 * sólo valen las que ofrece el anfitrión. La que no esté en el duelo la lee el anfitrión al contestar (`HostOptions.fetchCard`).
 */

export interface AnnounceEntry {
  code: number
  name: string
  /** El nombre sin mayúsculas ni tildes (`fold`). */
  folded: string
  data: OcgCardData
}

/** Los `OPCODE_*` de arquetipo (`constant.lua`): sin `setcode` en el catálogo, el filtro no se puede evaluar acá. */
const SETCODE_OPS = new Set([0x4000010100000000n, 0x4000010600000000n])
/** Cuántas del catálogo se muestran por búsqueda (la bandeja se desliza; más es ruido). */
export const ANNOUNCE_MAX = 30

export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** Las cartas del catálogo que se pueden declarar: sin fichas ni Habilidades (no tienen nombre declarable). */
export function announceEntries(catalog: readonly ApiCardSearchResult[]): AnnounceEntry[] {
  return catalog.flatMap((card) => (/Token|Skill/.test(card.cardType) ? [] : [{ code: card.ygoprodeckId, name: card.name, folded: fold(card.name), data: cardData(rowOfApiCard(card.ygoprodeckId, card.name, card)) }]))
}

/**
 * Las del catálogo cuyo nombre contiene `query` (las que empiezan así, primero) y cumplen el filtro (`matches`: `cardMatchesOpcode` del núcleo), sin las de `skip` (las que ya ofrece el
 * anfitrión), hasta `ANNOUNCE_MAX`. Sin texto o con un filtro de arquetipo, ninguna.
 */
export function announceMatches(entries: readonly AnnounceEntry[], query: string, opcodes: readonly string[], matches: (card: OcgCardData, filter: bigint[]) => boolean, skip: ReadonlySet<number>): AnnounceEntry[] {
  const needle = fold(query.trim())
  const filter = opcodes.map(BigInt)

  if (!needle || filter.some((op) => SETCODE_OPS.has(op))) return []
  const found = entries.filter((entry) => entry.folded.includes(needle) && !skip.has(entry.code) && (filter.length === 0 || matches(entry.data, filter)))

  return [...found.filter((entry) => entry.folded.startsWith(needle)), ...found.filter((entry) => !entry.folded.startsWith(needle))].slice(0, ANNOUNCE_MAX)
}

export interface AnnounceCatalog {
  entries: AnnounceEntry[]
  matches: (card: OcgCardData, filter: bigint[]) => boolean
}

let catalog: Promise<AnnounceCatalog> | null = null

/** El catálogo del armador (de la memoria o del dispositivo; ~20 MB la primera vez) y el filtro del núcleo (sólo su módulo, sin el wasm), bajo demanda y una vez por página. */
export function loadAnnounceCatalog(): Promise<AnnounceCatalog> {
  if (!catalog) {
    catalog = Promise.all([import('../../ygoprodeck').then((module) => module.loadCardCatalog()), import('ocgcore-wasm')]).then(([cards, core]) => ({ entries: announceEntries(cards), matches: core.cardMatchesOpcode }))
    catalog.catch(() => (catalog = null))
  }

  return catalog
}
