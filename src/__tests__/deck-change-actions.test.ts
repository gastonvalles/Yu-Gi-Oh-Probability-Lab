/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { readChangeSession, readDeckBefore } from '../app/deck-before'
import { removeDeckCardFromBuilder } from '../app/deck-builder-slice'
import { adoptBuild, undoDeckChange } from '../app/deck-change-actions'
import { deckCardsSignature } from '../app/saved-builds'
import { copies, deckState, fillerCards, fortyCardMain, storeWith } from './support/deck-fixtures'

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
