import { buildExpansionsHash, type Expansion, type ExpansionCard } from '../../app/card-prices'
import { normalizeSearchText } from '../../app/utils'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import type { IconName } from '../ui/Icon'

/** A dónde lleva un resultado del buscador: una pantalla o herramienta del menú (con lo escrito, si la herramienta lo usa), una carta o un link directo (`#tournaments?deck=…`). */
export type FinderAction = { type: 'select'; key: string; detail?: string } | { type: 'card'; card: ApiCardSearchResult } | { type: 'hash'; hash: string }

/** Un resultado de lo que no es una pantalla: la carta, el deck, la expansión, la impresión o el replay que se escribió. */
export interface FinderResult {
  /** Único en toda la lista (`card:46986414`, `deck:123`…). */
  id: string
  group: string
  label: string
  hint: string
  icon: IconName
  /** La carta, si el resultado es una (la fila muestra su arte en vez del ícono). */
  card?: ApiCardSearchResult
  action: FinderAction
}

/** Lo mínimo que se escribe para empezar a buscar fuera del menú (dos letras, como el buscador de cartas). */
export const FINDER_MIN_LENGTH = 2

export const words = (query: string): string[] => normalizeSearchText(query).split(' ').filter(Boolean)

// Los decks de torneo y los replays están en `finder-decks.ts`: traen los datos de los torneos y se cargan aparte.

/** El prefijo de un código de impresión («LOB» de «LOB-EN001» o de «lob-»), o `null` si lo escrito no parece uno. */
export function setCodePrefix(query: string): string | null {
  return /^([a-z0-9]{2,6})-[a-z0-9]*$/i.exec(query.trim())?.[1]?.toLowerCase() ?? null
}

/** Las expansiones que nombran lo escrito (su nombre, su código o su año) o cuyo código es el prefijo de lo escrito, las más nuevas primero (la lista ya viene así). */
export function findExpansionResults(expansions: readonly Expansion[], query: string, limit = 4): FinderResult[] {
  const wanted = words(query)
  const prefix = setCodePrefix(query)

  if (normalizeSearchText(query).length < FINDER_MIN_LENGTH) {
    return []
  }

  return expansions
    .filter((expansion) => (prefix !== null ? expansion.code.toLowerCase() === prefix : wanted.every((word) => normalizeSearchText(`${expansion.name} ${expansion.code} ${expansion.date}`).includes(word))))
    .slice(0, limit)
    .map((expansion) => ({
      id: `set:${expansion.id}`,
      group: t('shell.find.group.sets'),
      label: expansion.name,
      hint: [expansion.code, expansion.date.slice(0, 4), t('shell.find.setCards', { count: expansion.count })].filter(Boolean).join(' · '),
      icon: 'package',
      action: { type: 'hash', hash: `#expansions?set=${expansion.id}` },
    }))
}

/** Las impresiones de una expansión cuyo código empieza como lo escrito («LOB-EN00» → LOB-EN001…), a una pantalla de ver su rareza y su precio. */
export function findPrintResults(expansion: Pick<Expansion, 'id'>, cards: readonly ExpansionCard[], query: string, limit = 4): FinderResult[] {
  const code = normalizeSearchText(query.replace(/\s+/g, ''))

  if (setCodePrefix(query) === null || code.length < FINDER_MIN_LENGTH) {
    return []
  }

  return cards
    .filter((card) => normalizeSearchText(card.code).startsWith(code))
    .slice(0, limit)
    .map((card) => ({
      id: `print:${card.productId}`,
      group: t('shell.find.group.sets'),
      label: card.name,
      hint: [card.code, card.rarity].filter(Boolean).join(' · '),
      icon: 'package',
      action: { type: 'hash', hash: buildExpansionsHash({ expansion: expansion.id, print: card.productId }) },
    }))
}

/** Una carta de la búsqueda por nombre (o por código de YGOPRODeck): al tocarla se abre su detalle. */
export function cardResult(card: ApiCardSearchResult): FinderResult {
  return {
    id: `card:${card.ygoprodeckId}`,
    group: t('shell.find.group.cards'),
    label: card.name,
    hint: [card.cardType, card.archetype].filter(Boolean).join(' · '),
    icon: 'search',
    card,
    action: { type: 'card', card },
  }
}
