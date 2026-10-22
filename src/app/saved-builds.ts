import { t } from '../i18n'
import type { CardOrigin, CardRole } from '../types'
import type { DeckCardInstance } from './model'
import { normalizeStoredRoles, resolveStoredCardOrigin } from './deck-groups'
import { createId } from './utils'

export const SAVED_BUILDS_KEY = 'ygo-lab:saved-builds'

/** Se dispara en `window` cada vez que se escriben las builds: una lista abierta en otra pantalla las vuelve a leer con `readSavedBuilds()`. */
export const SAVED_BUILDS_EVENT = 'ygo-lab:saved-builds-change'

export interface BuildZones {
  main: DeckCardInstance[]
  extra: DeckCardInstance[]
  side: DeckCardInstance[]
}

/** De dónde salió una build: tu deck guardado, una lista importada o un cambio que probaste en el Lab. */
export type SavedBuildFrom = 'deck' | 'import' | 'lab'

const BUILD_FROMS: readonly string[] = ['deck', 'import', 'lab'] satisfies SavedBuildFrom[]

export interface SavedBuild extends BuildZones {
  id: string
  name: string
  savedAt: string
  /**
   * Opcional a propósito: las builds guardadas antes no lo tienen (y la clave sigue siendo un array sin versión, así una pestaña
   * vieja abierta la sigue leyendo en vez de verla vacía y pisarla). Sin el dato, la build se muestra como «guardada».
   */
  from?: SavedBuildFrom
}

export function readSavedBuilds(): SavedBuild[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_BUILDS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedBuild).map(migrateSavedBuild) : []
  } catch {
    return []
  }
}

export function writeSavedBuilds(builds: SavedBuild[]): void {
  try {
    localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(builds))
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): las builds viven sólo en esta sesión.
    return
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_BUILDS_EVENT))
  }
}

/** Cartas guardadas con roles u orígenes que ya no existen (Handtrap, Hybrid…): pasan a sus equivalentes. Vale para las builds y para «Tu deck de antes». */
export function migrateBuildCards(cards: DeckCardInstance[]): DeckCardInstance[] {
  return cards.map((card) => {
    const roles = normalizeStoredRoles(card.roles)

    return { ...card, roles, origin: resolveStoredCardOrigin(card.origin, roles) }
  })
}

/** Migra las cartas y descarta un `from` que no se conoce (lo demás queda igual que como se guardó). */
function migrateSavedBuild({ from, ...build }: SavedBuild): SavedBuild {
  const migrated = { ...build, main: migrateBuildCards(build.main), extra: migrateBuildCards(build.extra), side: migrateBuildCards(build.side) }

  return from !== undefined && BUILD_FROMS.includes(from) ? { ...migrated, from } : migrated
}

/**
 * Qué cartas hay en cada zona (ids de YGOPRODeck, sin importar el orden ni la clasificación). Dos decks con la misma firma tienen
 * las mismas cartas: sirve para saber si una build es igual a tu deck o si una edición cambió alguna cantidad o zona.
 */
export function deckCardsSignature(zones: BuildZones): string {
  const ids = (cards: DeckCardInstance[]) =>
    cards
      .map((card) => card.apiCard.ygoprodeckId)
      .sort((left, right) => left - right)
      .join(',')

  return `${ids(zones.main)}|${ids(zones.extra)}|${ids(zones.side)}`
}

/** Las mismas cartas en las mismas zonas (con las mismas listas en memoria ni siquiera compara). */
export function sameDeckCards(left: BuildZones, right: BuildZones): boolean {
  return (left.main === right.main && left.extra === right.extra && left.side === right.side) || deckCardsSignature(left) === deckCardsSignature(right)
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
  // Ese nombre se guarda con la build: queda en el idioma en que se guardó (después se puede renombrar).
  const base = name.trim() || t('meta.compare.untitledBuild')
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

export function createSavedBuild(
  name: string,
  zones: BuildZones,
  builds: readonly SavedBuild[],
  now = new Date(),
  from?: SavedBuildFrom,
): SavedBuild {
  const copy = (cards: DeckCardInstance[]) => cards.map((card) => ({ ...card, roles: [...card.roles] }))

  return {
    id: createId('build'),
    name: uniqueBuildName(name, builds),
    savedAt: now.toISOString(),
    main: copy(zones.main),
    extra: copy(zones.extra),
    side: copy(zones.side),
    ...(from ? { from } : {}),
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
