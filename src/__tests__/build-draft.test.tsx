/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BUILD_DRAFT_KEY,
  describeDraft,
  draftFromChanges,
  mainCopyLimit,
  parseBuildDraft,
  readBuildDraft,
  resolveDraft,
  saveDraftAsBuild,
  writeBuildDraft,
} from '../app/build-draft'
import { deriveMainDeckCardsFromZone } from '../app/calculator-state'
import { DRAFT_SOURCE, readComparisonSelection } from '../app/comparison-selection'
import { readDeckBefore } from '../app/deck-before'
import { removeDeckCardFromBuilder } from '../app/deck-builder-slice'
import type { ApplySwapResult } from '../app/deck-change-actions'
import { readSavedBuilds, SAVED_BUILDS_EVENT } from '../app/saved-builds'
import { useLabDraft } from '../app/use-lab-draft'
import { copies, deckState, fortyCardMain, storeWith } from './support/deck-fixtures'

const count = (main: { apiCard: { ygoprodeckId: number } }[], id: number) => main.filter((card) => card.apiCard.ygoprodeckId === id).length
const SWAP = { kind: 'swap', out: 10, in: 1 } as const

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('el borrador del Lab', () => {
  it('sale de la sugerencia del Lab (sacar una, meter otra)', () => {
    const cards = deriveMainDeckCardsFromZone(fortyCardMain())
    const handtrap = cards.find((card) => card.apiCard?.ygoprodeckId === 10)!
    const starter = cards.find((card) => card.apiCard?.ygoprodeckId === 1)!

    expect(draftFromChanges([{ action: 'remove', card: handtrap }, { action: 'add', card: starter }])).toEqual(SWAP)
    expect(draftFromChanges([{ action: 'add', card: starter }])).toBeNull()
  })

  it('se resuelve a tu deck con el cambio, sin guardarlo, y dice cuántas quedan', () => {
    const deck = deckState({ main: fortyCardMain() })
    const resolved = resolveDraft(SWAP, deck, 'unlimited')

    if (!resolved.ok) throw new Error('se esperaba un deck')
    expect([count(resolved.zones.main, 10), count(resolved.zones.main, 1), resolved.zones.main.length]).toEqual([2, 3, 40])
    expect(count(deck.main, 10)).toBe(3)

    const lines = describeDraft(deck, SWAP)
    expect([lines?.out.card.name, lines?.out.before, lines?.out.after]).toEqual(['Handtrap', 3, 2])
    expect([lines?.in.card.name, lines?.in.before, lines?.in.after]).toEqual(['Starter Uno', 2, 3])
  })

  it('se guarda en la pestaña (versión 1) y descarta lo que no entiende', () => {
    writeBuildDraft(SWAP)
    expect(JSON.parse(sessionStorage.getItem(BUILD_DRAFT_KEY)!)).toEqual({ v: 1, draft: SWAP })
    expect(readBuildDraft()).toEqual(SWAP)

    expect(parseBuildDraft({ v: 2, draft: SWAP })).toBeNull()
    expect(parseBuildDraft({ v: 1, draft: { kind: 'swap', out: 1, in: 1 } })).toBeNull()

    writeBuildDraft(null)
    expect(readBuildDraft()).toBeNull()
  })

  it('la sugerencia no pide copias que no entran: descuenta las del Side', () => {
    const limit = mainCopyLimit({ main: [], extra: [], side: copies(1, 'Starter Uno', 1, ['starter']) }, 'unlimited')
    const [starter] = deriveMainDeckCardsFromZone(fortyCardMain())

    expect(limit(starter!)).toBe(2)
  })

  it('«Guardar B» lo guarda como build del Lab y avisa a las listas', () => {
    const onSaved = vi.fn()
    window.addEventListener(SAVED_BUILDS_EVENT, onSaved)

    const build = saveDraftAsBuild(SWAP, deckState({ main: fortyCardMain() }, 'Mi deck'), 'unlimited')

    expect(build).toMatchObject({ name: 'Mi deck', from: 'lab' })
    expect(readSavedBuilds()).toEqual([build])
    expect(count(build!.main, 1)).toBe(3)
    expect(onSaved).toHaveBeenCalled()
    window.removeEventListener(SAVED_BUILDS_EVENT, onSaved)
  })
})

describe('useLabDraft', () => {
  const render = (main = fortyCardMain()) => {
    const store = storeWith(deckState({ main }))
    const hook = renderHook(() => useLabDraft(), { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> })

    return { store, hook }
  }

  it('«Probar el cambio» pone el Lab en borrador con las cartas del deck derivado, y la X lo descarta', () => {
    const { hook } = render()

    expect(hook.result.current.status).toBe('none')
    act(() => hook.result.current.start(SWAP))

    expect(hook.result.current.status).toBe('active')
    expect(hook.result.current.cards?.find((card) => card.apiCard?.ygoprodeckId === 1)?.copies).toBe(3)
    expect(hook.result.current.lines?.out.after).toBe(2)

    act(() => hook.result.current.discard())
    expect(hook.result.current.status).toBe('none')
  })

  it('«Aplicar al deck» lo guarda (con «Tu deck de antes») y «Deshacer» vuelve el deck y el borrador', () => {
    const { store, hook } = render()

    const done: { applied?: ApplySwapResult | null; undone?: boolean } = {}

    act(() => hook.result.current.start(SWAP))
    act(() => {
      done.applied = hook.result.current.apply()
    })

    expect(done.applied?.ok).toBe(true)
    expect(count(store.getState().deckBuilder.main, 1)).toBe(3)
    expect(hook.result.current.status).toBe('none')
    expect(readDeckBefore()?.counts.main).toBe(40)

    const { applied } = done
    if (!applied?.ok) throw new Error('se esperaba poder aplicar el cambio')

    act(() => {
      done.undone = hook.result.current.undo(applied.token)
    })
    expect(done.undone).toBe(true)
    expect(count(store.getState().deckBuilder.main, 1)).toBe(2)
    expect(hook.result.current.status).toBe('active')
  })

  it('«Comparar con mi deck» deja B = el borrador', () => {
    const { hook } = render()

    act(() => hook.result.current.start(SWAP))
    act(() => hook.result.current.compare())

    expect(readComparisonSelection().b).toBe(DRAFT_SOURCE)
  })

  it('si el deck cambió y el cambio ya no se puede aplicar, lo dice (no se pierde en silencio)', () => {
    const { store, hook } = render()

    act(() => hook.result.current.start(SWAP))
    act(() => {
      for (const card of store.getState().deckBuilder.main.filter((entry) => entry.apiCard.ygoprodeckId === 10)) {
        store.dispatch(removeDeckCardFromBuilder(card.instanceId))
      }
    })

    expect(hook.result.current.status).toBe('stale')
    expect(hook.result.current.problem).toEqual({ ok: false, reason: 'missing-card' })
  })
})
