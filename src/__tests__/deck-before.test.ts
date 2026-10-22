/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CHANGE_SESSION_IDLE_MS,
  CHANGE_SESSION_KEY,
  DECK_BEFORE_EVENT,
  DECK_BEFORE_KEY,
  endChangeSession,
  parseDeckBefore,
  planDeckChange,
  readChangeSession,
  readDeckBefore,
} from '../app/deck-before'
import {
  addSearchResultToDeckZone,
  moveDeckCardInBuilder,
  removeDeckCardFromBuilder,
  replaceDeckBuilder,
  setDeckName,
  sortAllDeckZones,
  toggleDeckCardRole,
} from '../app/deck-builder-slice'
import { deckCardsSignature } from '../app/saved-builds'
import { copies, deckState, fortyCardMain, searchResult, storeWith } from './support/deck-fixtures'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')

describe('«Tu deck de antes»: la máquina de estados', () => {
  const before = deckState({ main: fortyCardMain() })
  const after = deckState({ main: before.main.slice(1) })

  it('la primera edición que cambia cartas guarda el deck de antes y abre la sesión', () => {
    expect(planDeckChange(before, after, 'edit', null, NOW)).toEqual({ copy: before, session: { v: 1, lastChangeAt: NOW } })
  })

  it('con la sesión abierta, otra edición sólo la extiende (no pisa la copia)', () => {
    expect(planDeckChange(before, after, 'edit', { v: 1, lastChangeAt: NOW - 60_000 }, NOW)).toEqual({ session: { v: 1, lastChangeAt: NOW } })
  })

  it('después de 30 minutos sin editar, la próxima edición abre otra sesión y pisa la copia', () => {
    const plan = planDeckChange(before, after, 'edit', { v: 1, lastChangeAt: NOW - CHANGE_SESSION_IDLE_MS }, NOW)

    expect(plan.copy).toBe(before)
  })

  it('reemplazar el deck guarda el que se va y cierra la sesión; deshacer no cuenta', () => {
    expect(planDeckChange(before, after, 'replace', { v: 1, lastChangeAt: NOW }, NOW)).toEqual({ copy: before, session: null })
    expect(planDeckChange(before, after, 'restore', null, NOW)).toEqual({})
  })

  it('ordenar, clasificar o renombrar no es un cambio de cartas', () => {
    const reordered = deckState({ main: [...before.main].reverse() }, 'Otro nombre')

    expect(planDeckChange(before, reordered, 'edit', null, NOW)).toEqual({})
  })

  it('un deck vacío no queda como «deck de antes»', () => {
    const empty = deckState()

    expect(planDeckChange(empty, after, 'edit', null, NOW)).toEqual({ copy: null, session: { v: 1, lastChangeAt: NOW } })
  })

  it('lee sólo la versión que conoce y migra los roles viejos', () => {
    expect(parseDeckBefore({ v: 2, savedAt: 'x', main: [], extra: [], side: [] })).toBeNull()

    const [card] = copies(1, 'Vieja', 1, [])
    const parsed = parseDeckBefore({ v: 1, deckName: 'D', savedAt: '2026-10-22T00:00:00.000Z', main: [{ ...card, roles: ['removal'] }], extra: [], side: [] })

    expect(parsed?.main[0]?.roles).toEqual(['boardbreaker'])
    expect(parsed?.counts).toEqual({ main: 1, extra: 0, side: 0 })
  })
})

describe('«Tu deck de antes» en el flujo real del builder', () => {
  const extraCard = searchResult(500, 'Carta nueva')

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const addNew = () => addSearchResultToDeckZone({ apiCardId: 500, deckFormat: 'unlimited', index: 0, results: [extraCard], zone: 'main' })

  it('se guarda sola en la primera edición y no la pisan las siguientes', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const original = deckCardsSignature(store.getState().deckBuilder)
    const onChange = vi.fn()
    window.addEventListener(DECK_BEFORE_EVENT, onChange)

    store.dispatch(addNew())
    store.dispatch(removeDeckCardFromBuilder(store.getState().deckBuilder.main.at(-1)!.instanceId))

    const saved = readDeckBefore()
    expect(saved && deckCardsSignature(saved)).toBe(original)
    expect(saved?.deckName).toBe('Mi deck')
    expect(saved?.counts.main).toBe(40)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(readChangeSession()).toEqual({ v: 1, lastChangeAt: NOW })
    window.removeEventListener(DECK_BEFORE_EVENT, onChange)
  })

  it('clasificar, ordenar o escribir el nombre no abre una sesión', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))

    store.dispatch(setDeckName('Otro'))
    store.dispatch(sortAllDeckZones())
    store.dispatch(toggleDeckCardRole({ ygoprodeckId: 1, role: 'extender' }))

    expect(localStorage.getItem(DECK_BEFORE_KEY)).toBeNull()
    expect(localStorage.getItem(CHANGE_SESSION_KEY)).toBeNull()
  })

  it('mover una carta del Main al Side cuenta como un cambio', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const before = deckCardsSignature(store.getState().deckBuilder)

    store.dispatch(moveDeckCardInBuilder({ instanceId: store.getState().deckBuilder.main[0]!.instanceId, zone: 'side', index: 0 }))

    expect(deckCardsSignature(readDeckBefore()!)).toBe(before)
  })

  it('importar guarda el deck que se va y cierra la sesión: la edición siguiente guarda el importado', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const original = deckCardsSignature(store.getState().deckBuilder)
    const imported = deckState({ main: copies(7, 'Importada', 40, ['starter']) }, 'Importado')

    store.dispatch(addNew())
    store.dispatch(replaceDeckBuilder(imported))

    // El que se fue es el editado (con la carta nueva), no el de antes de la sesión: es el deck que reemplazaste.
    expect(readDeckBefore()?.main).toHaveLength(41)
    expect(deckCardsSignature(readDeckBefore()!)).not.toBe(original)
    expect(readChangeSession()).toBeNull()

    store.dispatch(addNew())
    expect(readDeckBefore()?.deckName).toBe('Importado')
  })

  it('reemplazar el deck por las mismas cartas (los puntos de Genesys al cargar) no toca nada', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))

    store.dispatch(replaceDeckBuilder({ ...store.getState().deckBuilder, main: store.getState().deckBuilder.main.map((card) => ({ ...card })) }))

    expect(localStorage.getItem(DECK_BEFORE_KEY)).toBeNull()
  })

  it('abrir Comparar o esperar 30 minutos termina la sesión: la próxima edición pisa la copia', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))

    store.dispatch(addNew())
    const afterFirst = deckCardsSignature(store.getState().deckBuilder)
    endChangeSession()
    store.dispatch(addNew())
    expect(deckCardsSignature(readDeckBefore()!)).toBe(afterFirst)

    const afterSecond = deckCardsSignature(store.getState().deckBuilder)
    vi.setSystemTime(NOW + CHANGE_SESSION_IDLE_MS + 1)
    store.dispatch(removeDeckCardFromBuilder(store.getState().deckBuilder.main[0]!.instanceId))
    expect(deckCardsSignature(readDeckBefore()!)).toBe(afterSecond)
  })

  it('una sesión abierta en otra pestaña también cuenta (no se pisa)', () => {
    localStorage.setItem(DECK_BEFORE_KEY, JSON.stringify({ v: 1, deckName: 'De la otra pestaña', savedAt: '2026-10-22T11:59:00.000Z', main: [], extra: [], side: [] }))
    localStorage.setItem(CHANGE_SESSION_KEY, JSON.stringify({ v: 1, lastChangeAt: NOW - 1000 }))
    const store = storeWith(deckState({ main: fortyCardMain() }))

    store.dispatch(addNew())

    expect(readDeckBefore()?.deckName).toBe('De la otra pestaña')
  })
})
