import { describe, expect, it } from 'vitest'

import { buildZoneActionEntries } from '../components/card-detail/card-zone-actions'
import type { ApiCardSearchResult } from '../ygoprodeck'

function card(cardType: string, frameType: string): ApiCardSearchResult {
  return { cardType, frameType, name: 'Test' } as ApiCardSearchResult
}

describe('buildZoneActionEntries', () => {
  it('un monstruo de efecto va al Main o al Side', () => {
    expect(buildZoneActionEntries(card('Effect Monster', 'effect')).map((entry) => entry.zone)).toEqual(['main', 'side'])
  })

  it('un monstruo de Fusión va al Extra o al Side', () => {
    expect(buildZoneActionEntries(card('Fusion Monster', 'fusion')).map((entry) => entry.zone)).toEqual(['extra', 'side'])
  })
})
