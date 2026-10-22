import type { Middleware } from '@reduxjs/toolkit'

import { replaceDeckBuilder, setDeckCards, type DeckCardsChange } from './deck-builder-slice'
import type { DeckBuilderState } from './model'
import { migrateBuildCards, sameDeckCards, type BuildZones } from './saved-builds'
import { isRecord } from './utils'

/**
 * «Tu deck de antes»: UNA copia del deck, la de antes de la sesión de cambios en curso, que se guarda sola.
 *
 * Una sesión de cambios empieza con la primera edición del builder que cambia la cantidad o la zona de una carta (si no había
 * otra abierta): ahí se guarda el deck de ANTES de esa edición. Mientras la sesión sigue, las ediciones no tocan la copia. Termina
 * al abrir Comparar (`endChangeSession`), al reemplazar el deck (importar, cargar un deck de torneo o una build: esos guardan el
 * deck que se va y cierran la sesión) o tras 30 minutos sin editar. La sesión siguiente pisa la copia.
 *
 * Costo: una edición sólo compara las cartas de las zonas (sin I/O si no cambió ninguna cantidad ni zona); si cambió, lee y escribe
 * la sesión (unos 40 bytes). El deck entero se serializa una vez por sesión (≈ lo mismo que una build guardada, decenas de KB).
 * Varias pestañas comparten la copia y la sesión (gana la última que escribe; nunca queda a medias: cada escritura es un JSON entero).
 * Ningún worker lo lee.
 */

/** `localStorage`: la copia (`DeckBefore`, versión 1). */
export const DECK_BEFORE_KEY = 'ygo-lab:deck-before'
/** `localStorage`: la sesión en curso (`ChangeSession`, versión 1). Aparte de la copia, así una edición no reescribe el deck entero. */
export const CHANGE_SESSION_KEY = 'ygo-lab:deck-before-session'
/** Se dispara en `window` cuando la copia cambia en esta pestaña (las otras se enteran por el evento `storage`). */
export const DECK_BEFORE_EVENT = 'ygo-lab:deck-before-change'
/** Pasado esto sin ediciones, la próxima abre otra sesión. */
export const CHANGE_SESSION_IDLE_MS = 30 * 60 * 1000

export interface DeckBefore extends BuildZones {
  v: 1
  /** Cómo se llamaba el deck en el builder. */
  deckName: string
  /** Cuándo se guardó (ISO): empieza la sesión de cambios. */
  savedAt: string
  counts: { main: number; extra: number; side: number }
}

export interface ChangeSession {
  v: 1
  /** Última edición de la sesión (ms). */
  lastChangeAt: number
}

/** Lo que guarda la copia: el nombre y las cartas del builder. */
type DeckCards = Pick<DeckBuilderState, 'deckName' | 'main' | 'extra' | 'side'>

export interface DeckBeforePlan {
  /** La copia nueva (`null`: no queda «deck de antes», el deck estaba vacío). Sin la propiedad, la copia no se toca. */
  copy?: DeckCards | null
  /** La sesión que queda (`null`: cerrada). Sin la propiedad, no se toca. */
  session?: ChangeSession | null
}

export function isSessionActive(session: ChangeSession | null, now: number): boolean {
  return session !== null && now - session.lastChangeAt < CHANGE_SESSION_IDLE_MS
}

const isEmpty = (deck: BuildZones) => deck.main.length + deck.extra.length + deck.side.length === 0

/** La máquina de estados, pura: qué hacer con la copia y la sesión ante un cambio del deck (`previous` → `next`). */
export function planDeckChange(
  previous: DeckCards,
  next: DeckCards,
  kind: DeckCardsChange,
  session: ChangeSession | null,
  now: number,
): DeckBeforePlan {
  if (kind === 'restore' || sameDeckCards(previous, next)) {
    return {}
  }

  // Un deck vacío no es un «deck de antes» con el que comparar.
  const copy = isEmpty(previous) ? null : previous

  if (kind === 'replace') {
    return { copy, session: null }
  }

  return isSessionActive(session, now) ? { session: { v: 1, lastChangeAt: now } } : { copy, session: { v: 1, lastChangeAt: now } }
}

export function parseDeckBefore(value: unknown): DeckBefore | null {
  if (!isRecord(value) || value.v !== 1 || typeof value.savedAt !== 'string' || !Array.isArray(value.main) || !Array.isArray(value.extra) || !Array.isArray(value.side)) {
    // Una versión que no se conoce se descarta: es una copia de conveniencia, la próxima sesión guarda otra.
    return null
  }

  const zones = { main: migrateBuildCards(value.main), extra: migrateBuildCards(value.extra), side: migrateBuildCards(value.side) }

  return {
    v: 1,
    deckName: typeof value.deckName === 'string' ? value.deckName : '',
    savedAt: value.savedAt,
    counts: { main: zones.main.length, extra: zones.extra.length, side: zones.side.length },
    ...zones,
  }
}

export function readDeckBefore(): DeckBefore | null {
  try {
    return parseDeckBefore(JSON.parse(localStorage.getItem(DECK_BEFORE_KEY) ?? 'null'))
  } catch {
    return null
  }
}

export function readChangeSession(): ChangeSession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHANGE_SESSION_KEY) ?? 'null')

    return isRecord(value) && value.v === 1 && typeof value.lastChangeAt === 'number' ? { v: 1, lastChangeAt: value.lastChangeAt } : null
  } catch {
    return null
  }
}

function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // ponytail: sin espacio (o sin almacenamiento) la copia no se guarda y la app sigue; si hiciera falta, liberar cachés como `saveState`.
  }
}

const notify = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DECK_BEFORE_EVENT))
  }
}

function toRecord(deck: DeckCards, now: number): DeckBefore {
  return {
    v: 1,
    deckName: deck.deckName,
    savedAt: new Date(now).toISOString(),
    counts: { main: deck.main.length, extra: deck.extra.length, side: deck.side.length },
    main: deck.main,
    extra: deck.extra,
    side: deck.side,
  }
}

/** Lleva la copia y la sesión ante un cambio del deck. Lo llama el middleware; las pruebas lo pueden llamar directo. */
export function recordDeckChange(previous: DeckCards, next: DeckCards, kind: DeckCardsChange, now = Date.now()): void {
  // Lo común (clasificar, ordenar, escribir el nombre) no cambia cantidades: ni siquiera se lee la sesión.
  if (kind === 'restore' || sameDeckCards(previous, next)) {
    return
  }

  const plan = planDeckChange(previous, next, kind, readChangeSession(), now)

  if (plan.copy !== undefined) {
    writeItem(DECK_BEFORE_KEY, plan.copy ? JSON.stringify(toRecord(plan.copy, now)) : null)
    notify()
  }

  if (plan.session !== undefined) {
    writeItem(CHANGE_SESSION_KEY, plan.session ? JSON.stringify(plan.session) : null)
  }
}

/** Cierra la sesión de cambios (al abrir Comparar): la próxima edición guarda otra copia. */
export function endChangeSession(): void {
  writeItem(CHANGE_SESSION_KEY, null)
}

/** Lo guardado tal cual (texto), para que un Deshacer lo deje como estaba. */
export interface DeckBeforeSnapshot {
  copy: string | null
  session: string | null
}

export function snapshotDeckBefore(): DeckBeforeSnapshot {
  try {
    return { copy: localStorage.getItem(DECK_BEFORE_KEY), session: localStorage.getItem(CHANGE_SESSION_KEY) }
  } catch {
    return { copy: null, session: null }
  }
}

export function restoreDeckBefore(snapshot: DeckBeforeSnapshot): void {
  writeItem(DECK_BEFORE_KEY, snapshot.copy)
  writeItem(CHANGE_SESSION_KEY, snapshot.session)
  notify()
}

function changeKindOf(action: unknown): DeckCardsChange {
  if (setDeckCards.match(action)) {
    return action.payload.as
  }

  return replaceDeckBuilder.match(action) ? 'replace' : 'edit'
}

/**
 * El enganche con el flujo real del builder (va en `store.ts`): cada acción que cambia `deckBuilder` se cuenta con el estado de antes
 * y el de después. `replaceDeckBuilder` (importar, decks de torneo) es un reemplazo; `setDeckCards` dice qué es; todo lo demás, una edición.
 */
export const deckBeforeMiddleware: Middleware<object, { deckBuilder: DeckBuilderState }> = (api) => (next) => (action) => {
  const previous = api.getState().deckBuilder
  const result = next(action)
  const current = api.getState().deckBuilder

  if (current !== previous) {
    recordDeckChange(previous, current, changeKindOf(action))
  }

  return result
}
