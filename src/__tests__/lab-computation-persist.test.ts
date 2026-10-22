// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { labComputationKey, peekLabComputation, requestLabComputation } from '../app/lab-computation-client'
import { LAB_CACHE_KEY } from '../app/lab-cache-store'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildActiveRuleSet } from '../app/pattern-presets'
import { useDraftImpact } from '../components/probability/use-draft-impact'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

const deck = (): CardEntry[] => [
  ...Array.from({ length: 12 }, (_, index) => card(`s${index}`, 1, ['starter'])),
  card('ht', 3, ['handtrap'], 'non_engine'),
  ...Array.from({ length: 25 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
]

/** jsdom no tiene `requestIdleCallback`: el guardado va con un timer de 0 ms que se espera acá. */
const afterPersist = () => new Promise((resolve) => setTimeout(resolve, 20))

const persistedKeys = (): string[] => (JSON.parse(localStorage.getItem(LAB_CACHE_KEY) ?? '{"order":[]}') as { order: string[] }).order

describe('qué resultados del Lab se guardan en el dispositivo', () => {
  it('una vista previa pasajera queda en memoria pero no desaloja el resultado del deck de verdad', async () => {
    const cards = deck()
    const real = { cards, patterns: buildActiveRuleSet(cards, [], []), handSize: 5 }
    const realKey = labComputationKey(real)

    await requestLabComputation(real)
    await afterPersist()
    expect(persistedKeys()).toEqual([realKey])

    // Más borradores que lugares tiene la caché guardada (4): con el viejo comportamiento el deck real salía.
    const previews = [6, 7, 8, 9, 10].map((handSize) => ({ ...real, handSize }))

    for (const preview of previews) {
      await requestLabComputation(preview, labComputationKey(preview), { persist: false })
    }

    await afterPersist()

    expect(persistedKeys()).toEqual([realKey])
    expect(peekLabComputation(labComputationKey(previews[0]!))).not.toBeNull()
  })

  it('el borrador de una regla calcula su vista previa sin guardarla en el dispositivo', async () => {
    const cards = deck()
    const real = { cards, patterns: buildActiveRuleSet(cards, [], []), handSize: 5 }

    await requestLabComputation(real)
    await afterPersist()

    const before = persistedKeys()
    const draft = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])
    // Las props van estables, como en el panel: arrays nuevos en cada render relanzarían el cálculo sin parar.
    const input = { draft, cards, customPatterns: [], disabledGenericRuleIds: [], handSize: 5, cleanBefore: { first: 0.5, second: 0.5, average: 0.5 } }
    const { result } = renderHook(() => useDraftImpact(input))

    await waitFor(() => expect(result.current.impact).not.toBeNull())
    // El hook termina de asentarse (y de guardar, si guardara) después de mostrar la vista previa.
    await act(async () => {
      await afterPersist()
    })

    expect(persistedKeys()).toEqual(before)
  })
})
