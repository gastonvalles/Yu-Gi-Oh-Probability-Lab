/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { readChangeSession, readDeckBefore } from '../app/deck-before'
import { removeDeckCardFromBuilder } from '../app/deck-builder-slice'
import { adoptBuild, applySwapToDeck, undoDeckChange } from '../app/deck-change-actions'
import { setDeckFormat } from '../app/settings-slice'
import { deckCardsSignature } from '../app/saved-builds'
import { copies, deckState, fillerCards, fortyCardMain, storeWith } from './support/deck-fixtures'

const mainCount = (main: { apiCard: { ygoprodeckId: number } }[], id: number) => main.filter((card) => card.apiCard.ygoprodeckId === id).length

describe('cargar una build en el builder (adoptBuild)', () => {
  beforeEach(() => localStorage.clear())

  it('reemplaza el deck por B, guarda el que se va como «Tu deck de antes» y cierra la sesión', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }, 'Mi deck'))
    const mine = deckCardsSignature(store.getState().deckBuilder)
    const b = { main: [...copies(5, 'Otra', 3, ['starter']), ...fillerCards(37)], extra: [], side: [] }

    const token = store.dispatch(adoptBuild({ zones: b, name: 'fire-king-v2' }))

    expect(store.getState().deckBuilder.deckName).toBe('fire-king-v2')
    expect(deckCardsSignature(store.getState().deckBuilder)).toBe(deckCardsSignature(b))
    expect(deckCardsSignature(readDeckBefore()!)).toBe(mine)
    expect(readDeckBefore()?.deckName).toBe('Mi deck')
    expect(readChangeSession()).toBeNull()
    expect(token.kind).toBe('adopt')
  })

  it('Deshacer vuelve el deck y la copia de antes a como estaban', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }, 'Mi deck'))
    const original = store.getState().deckBuilder
    const b = { main: [...copies(5, 'Otra', 3, ['starter']), ...fillerCards(37)], extra: [], side: [] }

    const token = store.dispatch(adoptBuild({ zones: b, name: 'B' }))

    expect(store.dispatch(undoDeckChange(token))).toBe(true)
    expect(store.getState().deckBuilder.deckName).toBe('Mi deck')
    expect(deckCardsSignature(store.getState().deckBuilder)).toBe(deckCardsSignature(original))
    expect(readDeckBefore()).toBeNull()
  })

  it('no deshace si el deck cambió después (no pisa lo que editaste)', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const token = store.dispatch(adoptBuild({ zones: { main: [...copies(5, 'Otra', 3, ['starter']), ...fillerCards(37)], extra: [], side: [] } }))

    store.dispatch(removeDeckCardFromBuilder(store.getState().deckBuilder.main[0]!.instanceId))

    expect(store.dispatch(undoDeckChange(token))).toBe(false)
    expect(store.getState().deckBuilder.main).toHaveLength(39)
  })
})

describe('aplicar un cambio del Lab al deck (applySwapToDeck)', () => {
  beforeEach(() => localStorage.clear())

  it('saca 1 copia, mete 1 de otra y abre la sesión de cambios con el deck de antes', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const before = deckCardsSignature(store.getState().deckBuilder)

    const result = store.dispatch(applySwapToDeck({ kind: 'swap', out: 10, in: 1 }))
    const main = store.getState().deckBuilder.main

    expect(result.ok).toBe(true)
    expect(mainCount(main, 10)).toBe(2)
    expect(mainCount(main, 1)).toBe(3)
    expect(main).toHaveLength(40)
    expect(deckCardsSignature(readDeckBefore()!)).toBe(before)
    expect(readChangeSession()).not.toBeNull()
  })

  it('respeta el límite del formato contando las copias del Side, y lo dice', () => {
    const store = storeWith(deckState({ main: fortyCardMain(), side: copies(1, 'Starter Uno', 1, ['starter']) }))

    // Starter Uno tiene 2 en el Main y 1 en el Side: en Unlimited no entra otra.
    store.dispatch(setDeckFormat('unlimited'))
    const result = store.dispatch(applySwapToDeck({ kind: 'swap', out: 10, in: 1 }))

    expect(result).toMatchObject({ ok: false, reason: 'not-allowed' })
    expect(result.ok ? '' : 'issue' in result ? result.issue : '').toMatch(/Starter Uno/)
    expect(mainCount(store.getState().deckBuilder.main, 10)).toBe(3)
    expect(readDeckBefore()).toBeNull()
  })

  it('una carta limitada en la banlist no pasa de su límite', () => {
    const limited = copies(30, 'Limitada', 1, ['starter'], { api: { banlist: { tcg: 'limited', ocg: null, goat: null } } })
    const store = storeWith(deckState({ main: [...fortyCardMain().slice(1), ...limited] }))

    store.dispatch(setDeckFormat('tcg'))

    expect(store.dispatch(applySwapToDeck({ kind: 'swap', out: 10, in: 30 }))).toMatchObject({ ok: false, reason: 'not-allowed' })
  })

  it('si la carta que sale ya no está en el Main, no toca nada', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))

    expect(store.dispatch(applySwapToDeck({ kind: 'swap', out: 999, in: 1 }))).toEqual({ ok: false, reason: 'missing-card' })
  })

  it('Deshacer vuelve el deck y deja «Tu deck de antes» como estaba antes de aplicar', () => {
    const store = storeWith(deckState({ main: fortyCardMain() }))
    const original = deckCardsSignature(store.getState().deckBuilder)
    const result = store.dispatch(applySwapToDeck({ kind: 'swap', out: 10, in: 1 }))

    if (!result.ok) throw new Error('se esperaba poder aplicar el cambio')

    expect(store.dispatch(undoDeckChange(result.token))).toBe(true)
    expect(deckCardsSignature(store.getState().deckBuilder)).toBe(original)
    expect(readDeckBefore()).toBeNull()
    expect(readChangeSession()).toBeNull()
  })
})
