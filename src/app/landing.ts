import { atLeastProbability } from './quick-odds'

/**
 * La portada para visitas nuevas en `/`: si se muestra, la cuenta de su calculadora y la entrada a la app. Va en el archivo chico de la landing:
 * no importa el store ni nada de las pantallas.
 */

/** La marca de sesión «ya entré»: la escriben los botones de la landing y la app al mostrarse; con ella la landing no vuelve en esta pestaña. */
export const LANDING_ENTERED_KEY = 'ygo-lab:entered'
/** La misma clave del deck guardado que `STORAGE_KEY` de `model.ts` (no se importa: arrastraría el modelo entero). */
export const SAVED_DECK_KEY = 'ygo-probability-lab:v2'

export interface LandingInput {
  hash: string
  search: string
  /** Lo guardado en `SAVED_DECK_KEY`: `null` si no hay nada, `undefined` si el almacenamiento no se pudo leer. */
  savedDeck: string | null | undefined
  /** Abierta como la app instalada (PWA). */
  standalone: boolean
  entered: boolean
}

/** Un deck con cartas en el Main. Lo que no se entiende cuenta como deck: quien tiene algo guardado vuelve, no llega. */
function hasMainDeck(saved: string): boolean {
  try {
    const main = (JSON.parse(saved) as { deckBuilder?: { main?: unknown } } | null)?.deckBuilder?.main

    return !Array.isArray(main) || main.length > 0
  } catch {
    return true
  }
}

/** La landing sólo la ve quien llega a `/` por primera vez; `?landing=1` la fuerza (para probarla). */
export function shouldShowLanding({ hash, search, savedDeck, standalone, entered }: LandingInput): boolean {
  if (new URLSearchParams(search).get('landing') === '1') return true
  if (hash !== '' && hash !== '#') return false
  if (standalone || entered || savedDeck === undefined) return false

  return savedDeck === null || !hasMainDeck(savedDeck)
}

function readStorage(storage: () => Storage, key: string): string | null | undefined {
  try {
    return storage().getItem(key)
  } catch {
    return undefined
  }
}

/** Lo que decide la landing, leído de la página. */
export function readLandingInput(): LandingInput {
  const nav = window.navigator as Navigator & { standalone?: boolean }

  return {
    hash: window.location.hash,
    search: window.location.search,
    savedDeck: readStorage(() => window.localStorage, SAVED_DECK_KEY),
    standalone: nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches),
    entered: readStorage(() => window.sessionStorage, LANDING_ENTERED_KEY) === '1',
  }
}

export function markEntered(): void {
  try {
    window.sessionStorage.setItem(LANDING_ENTERED_KEY, '1')
  } catch { /* sin almacenamiento la landing puede volver al recargar: nada se pierde */ }
}

/** Entra a la app sin recargar: la marca y el hash (la app escucha `hashchange`). */
export function enterApp(hash: '#deck-builder' | '#duel'): void {
  markEntered()
  window.location.hash = hash
}

export const LANDING_DECK_SIZE = 40
export const LANDING_COPIES = [1, 2, 3] as const
export type LandingCopies = (typeof LANDING_COPIES)[number]
export type LandingTurn = 'first' | 'second'

/** Mano de 5 yendo primero y de 6 yendo segundo (roba en su primer turno). */
export const handSizeFor = (turn: LandingTurn): number => (turn === 'first' ? 5 : 6)

/** P(al menos una copia) en la mano inicial de un deck de 40: la misma hipergeométrica de la Calculadora rápida del Lab. */
export function openingOdds(copies: number, turn: LandingTurn): number {
  return atLeastProbability(LANDING_DECK_SIZE, copies, handSizeFor(turn), 1)
}

/** Las cifras de «El meta» que arma el build (`scripts/write-build-id.mjs` → `src/data/landing-stats.json`). */
export interface LandingStats {
  /** Decks TCG de las últimas `weeks` semanas, los que lista Decks de torneo sin filtros. */
  tcgDecks: number
  weeks: number
  /** AAAA-MM-DD (o AAAA-MM) de la banlist TCG vigente al armar el build. */
  banlist: string
  /** AAAA-MM-DD del día de los precios. */
  prices: string
}
