import { atLeastProbability } from './quick-odds'

/**
 * «Inicio» (`#inicio`), el paso de la app al que llega la primera carga de cada sesión en `/`: quién llega ahí y la cuenta de su calculadora. Lo lee el arranque (`App.tsx`) antes
 * de bajar la app: no importa el store ni nada de las pantallas.
 */

/** La marca de sesión «ya entré»: la escribe el arranque; con ella, `/` sin hash no vuelve a «Inicio» en esta pestaña. */
export const LANDING_ENTERED_KEY = 'ygo-lab:entered'

export interface LandingInput {
  hash: string
  search: string
  entered: boolean
}

/** El paso «Inicio», el primero del menú. */
export const HOME_HASH = '#inicio'

/**
 * A «Inicio» llega sola la primera carga de la sesión en `/` sin hash, para todos: visita nueva, quien ya tiene deck (ahí lo retoma con «Seguir con tu deck») y la app
 * instalada. Un hash abre lo suyo; `?landing=1` lleva siempre (para probarla).
 */
export function shouldShowLanding({ hash, search, entered }: LandingInput): boolean {
  if (new URLSearchParams(search).get('landing') === '1') return true
  if (hash !== '' && hash !== '#') return false

  return !entered
}

/** Lo que decide la landing, leído de la página. Sin almacenamiento cuenta como sesión nueva: «Inicio» puede volver al recargar `/`, nada se pierde. */
export function readLandingInput(): LandingInput {
  let entered = false

  try {
    entered = window.sessionStorage.getItem(LANDING_ENTERED_KEY) === '1'
  } catch { /* ver arriba */ }

  return { hash: window.location.hash, search: window.location.search, entered }
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
