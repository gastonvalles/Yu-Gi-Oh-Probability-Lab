/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import type { DeckCardInstance } from '../app/model'
import {
  classifyBuildCard,
  createSavedBuild,
  readSavedBuilds,
  uniqueBuildName,
  withReferenceClassification,
  writeSavedBuilds,
} from '../app/saved-builds'

function instance(id: number, roles: DeckCardInstance['roles'] = [], origin: DeckCardInstance['origin'] = null): DeckCardInstance {
  return {
    instanceId: `i-${id}-${Math.random()}`,
    name: `Card ${id}`,
    apiCard: { ygoprodeckId: id } as DeckCardInstance['apiCard'],
    origin,
    roles,
    needsReview: origin === null,
  }
}

describe('builds guardadas', () => {
  beforeEach(() => localStorage.clear())

  it('se guardan y se leen del navegador', () => {
    const build = createSavedBuild('Mitsurugi 40', { main: [instance(1)], extra: [], side: [] }, [])
    writeSavedBuilds([build])
    expect(readSavedBuilds()).toEqual([build])
  })

  it('no repite nombres', () => {
    const first = createSavedBuild('Mitsurugi', { main: [], extra: [], side: [] }, [])
    expect(uniqueBuildName('mitsurugi', [first])).toBe('mitsurugi (2)')
  })

  it('clasificar una carta afecta todas sus copias', () => {
    const build = createSavedBuild('B', { main: [instance(7), instance(7), instance(8)], extra: [], side: [] }, [])
    const next = classifyBuildCard(build, 7, 'non_engine', ['handtrap'])

    expect(next.main.filter((card) => card.apiCard.ygoprodeckId === 7).every((card) => card.roles[0] === 'handtrap' && !card.needsReview)).toBe(true)
    expect(next.main[2]!.origin).toBeNull()
  })

  it('una carta que ya está en tu deck usa esa clasificación', () => {
    const reference = [instance(7, ['handtrap'], 'non_engine')]
    const [shared, unknown] = withReferenceClassification([instance(7), instance(9)], reference)

    expect(shared).toMatchObject({ origin: 'non_engine', roles: ['handtrap'] })
    expect(unknown!.origin).toBeNull()
  })
})
