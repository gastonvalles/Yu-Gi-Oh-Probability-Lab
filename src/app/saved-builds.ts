import type { CardOrigin, CardRole } from '../types'
import type { DeckCardInstance } from './model'
import { createId } from './utils'

const SAVED_BUILDS_KEY = 'ygo-lab:saved-builds'

export interface BuildZones {
  main: DeckCardInstance[]
  extra: DeckCardInstance[]
  side: DeckCardInstance[]
}

export interface SavedBuild extends BuildZones {
  id: string
  name: string
  savedAt: string
}

export function readSavedBuilds(): SavedBuild[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_BUILDS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedBuild) : []
  } catch {
    return []
  }
}

export function writeSavedBuilds(builds: SavedBuild[]): void {
  try {
    localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(builds))
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): las builds viven sólo en esta sesión.
  }
}

function isSavedBuild(value: unknown): value is SavedBuild {
  if (!value || typeof value !== 'object') {
    return false
  }

  const build = value as Partial<SavedBuild>
  return (
    typeof build.id === 'string' &&
    typeof build.name === 'string' &&
    typeof build.savedAt === 'string' &&
    Array.isArray(build.main) &&
    Array.isArray(build.extra) &&
    Array.isArray(build.side)
  )
}

/** Evita dos builds con el mismo nombre: "Mitsurugi", "Mitsurugi (2)"… */
export function uniqueBuildName(name: string, builds: readonly SavedBuild[]): string {
  const base = name.trim() || 'Build sin nombre'
  const taken = new Set(builds.map((build) => build.name.toLowerCase()))

  if (!taken.has(base.toLowerCase())) {
    return base
  }

  let index = 2
  while (taken.has(`${base} (${index})`.toLowerCase())) {
    index += 1
  }
  return `${base} (${index})`
}

export function createSavedBuild(name: string, zones: BuildZones, builds: readonly SavedBuild[], now = new Date()): SavedBuild {
  const copy = (cards: DeckCardInstance[]) => cards.map((card) => ({ ...card, roles: [...card.roles] }))

  return {
    id: createId('build'),
    name: uniqueBuildName(name, builds),
    savedAt: now.toISOString(),
    main: copy(zones.main),
    extra: copy(zones.extra),
    side: copy(zones.side),
  }
}

/** Clasifica todas las copias de una carta (por id de YGOPRODeck) dentro de una build. */
export function classifyBuildCard(
  build: SavedBuild,
  ygoprodeckId: number,
  origin: CardOrigin,
  roles: CardRole[],
): SavedBuild {
  const apply = (cards: DeckCardInstance[]) =>
    cards.map((card) =>
      card.apiCard.ygoprodeckId === ygoprodeckId ? { ...card, origin, roles: [...roles], needsReview: false } : card,
    )

  return { ...build, main: apply(build.main), extra: apply(build.extra), side: apply(build.side) }
}

/**
 * Una misma carta se clasifica igual en todas las builds: si está en el deck de
 * referencia (tu deck actual), manda esa clasificación. Así la comparación es justa.
 */
export function withReferenceClassification(
  cards: DeckCardInstance[],
  reference: readonly DeckCardInstance[],
): DeckCardInstance[] {
  const byId = new Map(reference.map((card) => [card.apiCard.ygoprodeckId, card]))

  return cards.map((card) => {
    const known = byId.get(card.apiCard.ygoprodeckId)
    return known ? { ...card, origin: known.origin, roles: [...known.roles], needsReview: known.needsReview } : card
  })
}
