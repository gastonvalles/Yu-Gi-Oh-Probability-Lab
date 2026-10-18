// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmAllClassifications } from '../app/deck-builder'
import { confirmAllDeckCardClassifications } from '../app/deck-builder-slice'
import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import { DeckRolesPanel } from '../components/DeckRolesPanel'
import { LabPendingClassification } from '../components/probability/LabPendingClassification'
import type { CardEntry, CardOrigin, CardRole } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../app/store', () => ({ stopPersisting: () => {} }))
vi.mock('../app/use-toast-message', () => ({ useToastMessage: () => ({ showToast: () => {} }) }))

const apiCard = (ygoprodeckId: number): ApiCardSearchResult => ({
  ygoprodeckId, name: `Carta ${ygoprodeckId}`, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4, linkValue: null, atk: '0', def: '0',
  archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

const instance = (id: number, origin: CardOrigin | null, roles: CardRole[], needsReview: boolean): DeckCardInstance => ({
  instanceId: `i${id}`, name: `Carta ${id}`, apiCard: apiCard(id), origin, roles, needsReview,
})

const entry = (id: number, origin: CardOrigin | null, roles: CardRole[], needsReview: boolean): CardEntry => ({
  id: `c${id}`, name: `Carta ${id}`, copies: 1, source: 'manual', apiCard: apiCard(id), origin, roles, needsReview,
})

const deck = (main: DeckCardInstance[]): DeckBuilderState => ({ deckName: 'Gatos', main, extra: [], side: [], isEditingDeck: false })

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('confirmar todas las sugerencias de clasificación', () => {
  it('da por buenas las que ya tienen origen y roles, y deja las que falta decidir', () => {
    const before = deck([instance(1, 'engine', ['starter'], true), instance(2, 'non_engine', ['handtrap'], true), instance(3, 'engine', [], true), instance(4, null, [], true), instance(5, 'engine', ['payoff'], false)])
    const after = confirmAllClassifications(before)

    expect(after.main.map((card) => card.needsReview)).toEqual([false, false, true, true, false])
    // No toca lo que ya estaba como estaba, ni muta el estado anterior.
    expect(before.main.map((card) => card.needsReview)).toEqual([true, true, true, true, false])
    expect(after.main[0]!.roles).toEqual(['starter'])
  })

  it('si no hay nada que confirmar devuelve el mismo estado (nada se vuelve a dibujar)', () => {
    const before = deck([instance(1, 'engine', ['starter'], false), instance(2, null, [], true)])

    expect(confirmAllClassifications(before)).toBe(before)
  })
})

/** Un store de mentira: sólo lo que leen las cartas (el formato) y un registro de las acciones que se mandan. */
const fakeStore = () => {
  const log: string[] = []
  const store = configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state,
      log: (state: string[] = [], action: { type: string }) => (action.type.startsWith('@@') ? state : [...state, action.type]),
    },
  })

  store.subscribe(() => log.splice(0, log.length, ...store.getState().log))

  return { store, log }
}

describe('el banner de Roles', () => {
  const setup = (cards: CardEntry[]) => {
    const { store, log } = fakeStore()

    render(
      <Provider store={store}>
        <DeckRolesPanel cards={cards} onSetOrigin={() => {}} onToggleRole={() => {}} onConfirm={() => {}} onOpenLab={() => {}} />
      </Provider>,
    )

    return log
  }

  it('con sugerencias sin confirmar ofrece confirmarlas todas (la principal, al final) o revisarlas una por una', () => {
    const log = setup([entry(1, 'engine', ['starter'], true), entry(2, 'non_engine', ['handtrap'], true), entry(3, 'engine', ['payoff'], true)])

    expect(screen.getByText('Confirmá 3 sugerencias para cerrar la clasificación')).toBeInTheDocument()

    const review = screen.getByRole('button', { name: 'Revisar una por una' })
    const confirmAll = screen.getByRole('button', { name: 'Confirmar las 3 sugerencias' })
    // La principal va después de la secundaria.
    expect(review.compareDocumentPosition(confirmAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(confirmAll)
    expect(log).toContain(confirmAllDeckCardClassifications.type)
  })

  it('sin sugerencias pendientes no ofrece confirmar: lleva al Lab', () => {
    setup([entry(1, 'engine', ['starter'], false)])

    expect(screen.queryByRole('button', { name: /^Confirmar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir al Lab' })).toBeInTheDocument()
  })
})

describe('la lista de pendientes del Lab', () => {
  const props = { message: '', onSetOrigin: () => {}, onToggleRole: () => {}, onConfirm: () => {}, onEditingChange: () => {} }

  it('confirma de un toque las sugerencias completas (sin las que falta decidir) y mide', () => {
    const onConfirmAll = vi.fn()

    render(
      <Provider store={fakeStore().store}>
        <LabPendingClassification {...props} cards={[entry(1, 'engine', ['starter'], true), entry(2, 'engine', ['payoff'], true), entry(3, 'engine', [], true)]} onConfirmAll={onConfirmAll} />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar las 2 sugerencias y medir' }))
    expect(onConfirmAll).toHaveBeenCalledTimes(1)
  })

  it('sin sugerencias completas pendientes no aparece el botón', () => {
    render(
      <Provider store={fakeStore().store}>
        <LabPendingClassification {...props} cards={[entry(1, 'engine', [], true), entry(2, null, [], false)]} onConfirmAll={() => {}} />
      </Provider>,
    )

    expect(screen.queryByRole('button', { name: /^Confirmar/ })).not.toBeInTheDocument()
  })
})
