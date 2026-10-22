import type { CardRole } from '../types'
import { formatWholePercent } from './utils'

/**
 * Lo que el Lab dice de un cambio de una carta («Probar el cambio»): cuánto se mueve cada número y con qué rol se nombra cada carta. Puro, sin DOM.
 */

/**
 * La diferencia que se ve entre dos valores «de cada 100»: la de los enteros que muestran los anillos (81 → 85 = 4). Si los dos se ven igual
 * («>99» y «>99», «<1» y «<1»), 0: un ▲ que el anillo no muestra sería un número inventado.
 */
export function per100Delta(before: number, after: number): number {
  return formatWholePercent(before) === formatWholePercent(after) ? 0 : Math.round(after * 100) - Math.round(before * 100)
}

/** Para qué está la carta, como lo diría un jugador: primero lo que abre o interrumpe, después el resto (en el orden de la pantalla de Roles). */
const ROLE_PRIORITY: readonly CardRole[] = ['starter', 'handtrap', 'extender', 'boardbreaker', 'disruption', 'floodgate', 'brick', 'garnet', 'enabler', 'searcher', 'draw', 'payoff', 'recovery']

/** El rol con que se nombra una carta del cambio («Fire King Island · Starter», aunque su primer rol guardado sea Searcher). */
export function mainRole(roles: readonly CardRole[]): CardRole | null {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0] ?? null
}
