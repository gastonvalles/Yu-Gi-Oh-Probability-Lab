import { atLeastProbability } from './quick-odds'

/**
 * «Inicio» (`#inicio`), el paso de la app al que llega una visita nueva en `/`: quién llega ahí y la cuenta de su calculadora. Lo lee el arranque (`App.tsx`) antes de bajar la
 * app: no importa el store ni nada de las pantallas.
 */

/** La marca de sesión «ya entré»: la escribe el arranque; con ella, `/` sin hash no vuelve a «Inicio» en esta pestaña. */
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

/** El paso «Inicio», el primero del menú. */
export const HOME_HASH = '#inicio'

/** A «Inicio» llega sola sólo la visita nueva en `/`; `?landing=1` lleva siempre (para probarla). */
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
  } catch { /* sin almacenamiento, «Inicio» puede volver al recargar `/`: nada se pierde */ }
}

const LANDING_DECK_SIZE = 40
export const LANDING_COPIES = [1, 2, 3] as const
export type LandingCopies = (typeof LANDING_COPIES)[number]
export type LandingTurn = 'first' | 'second'

/** Mano de 5 yendo primero y de 6 yendo segundo (roba en su primer turno). */
export const handSizeFor = (turn: LandingTurn): number => (turn === 'first' ? 5 : 6)

/** P(al menos una copia) en la mano inicial de un deck de 40: la misma hipergeométrica de la Calculadora rápida del Lab. */
export function openingOdds(copies: number, turn: LandingTurn): number {
  return atLeastProbability(LANDING_DECK_SIZE, copies, handSizeFor(turn), 1)
}

/** Las cifras de «Lo más jugado del meta» que arma el build (`scripts/write-build-id.mjs` → `src/data/landing-stats.json`). */
export interface LandingStats {
  /** Decks TCG de las últimas `weeks` semanas, los que lista Decks de torneo sin filtros. */
  tcgDecks: number
  weeks: number
  /** AAAA-MM-DD (o AAAA-MM) de la banlist TCG vigente al armar el build. */
  banlist: string
  /** AAAA-MM-DD del día de los precios. */
  prices: string
  /** Las seis cartas que más decks TCG de esas semanas llevan en el Main, con en cuántos. */
  topCards: Array<{ id: number; name: string; decks: number }>
}
