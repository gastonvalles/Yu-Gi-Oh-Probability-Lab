import type { CardGenesysInfo } from '../types'
import { formatTables } from './format-data'
import type { DeckBuilderState, DeckCardInstance } from './model'

// Es el `pointCap` de genesys-card-data.json (un test lo comprueba): va escrito acá para no cargar la tabla entera sólo por mostrar el tope.
export const GENESYS_POINT_CAP = 100

// ASCII imprimible con espacios simples: casi todos los nombres. A esos sólo les falta pasar a minúsculas (el resto del camino no los toca).
const PLAIN_ASCII_NAME = /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/

function normalizeGenesysCardName(value: string): string {
  if (PLAIN_ASCII_NAME.test(value)) {
    return value.toLowerCase()
  }

  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildGenesysCardInfo(cardName: string): CardGenesysInfo {
  return {
    points: getGenesysPointsByName(cardName),
  }
}

// Con la tabla sin cargar ninguna carta figura (null): leerla antes de tiempo nunca falla.
function getGenesysPointsByName(cardName: string): number | null {
  const points = formatTables.genesys?.[normalizeGenesysCardName(cardName)]
  return typeof points === 'number' ? points : null
}

/**
 * Completa los puntos que quedaron en null porque el deck se leyó antes de que bajara la tabla: se resuelven por nombre, igual que al leerlo con la tabla.
 * Sin nada que completar devuelve el mismo deck (ni un guardado ni un dibujo de más).
 */
export function refreshStoredGenesysPoints(deckBuilder: DeckBuilderState): DeckBuilderState {
  let changed = false

  const refreshZone = (cards: DeckCardInstance[]) =>
    cards.map((card) => {
      const points = card.apiCard.genesys.points === null ? getGenesysPointsByName(card.name) : null

      if (points === null) {
        return card
      }

      changed = true
      return { ...card, apiCard: { ...card.apiCard, genesys: { points } } }
    })

  const main = refreshZone(deckBuilder.main)
  const extra = refreshZone(deckBuilder.extra)
  const side = refreshZone(deckBuilder.side)

  return changed ? { ...deckBuilder, main, extra, side } : deckBuilder
}

export function isGenesysLegalCardName(cardName: string): boolean {
  return getGenesysPointsByName(cardName) !== null
}

export function calculateGenesysDeckPointTotal(deckBuilder: DeckBuilderState): number {
  return [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side].reduce(
    (total, card) => total + (card.apiCard.genesys.points ?? getGenesysPointsByName(card.name) ?? 0),
    0,
  )
}
