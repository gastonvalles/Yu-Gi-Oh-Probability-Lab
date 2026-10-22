/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import type { DeckCardInstance } from '../app/model'
import {
  classifyBuildCard,
  createSavedBuild,
  readSavedBuilds,
  sameDeckCards,
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

  it('recuerda de dónde salió la build y descarta un origen que no conoce (lo guardado antes no lo tiene)', () => {
    const fromLab = createSavedBuild('Del Lab', { main: [instance(1)], extra: [], side: [] }, [], new Date(), 'lab')
    const unknown = { ...createSavedBuild('Rara', { main: [], extra: [], side: [] }, []), from: 'otra-cosa' }

    localStorage.setItem('ygo-lab:saved-builds', JSON.stringify([fromLab, unknown]))

    const [lab, rare] = readSavedBuilds()
    expect(lab?.from).toBe('lab')
    expect(rare && 'from' in rare).toBe(false)
  })

  it('dos decks con las mismas cartas en las mismas zonas tienen la misma firma (sin importar el orden)', () => {
    const one = { main: [instance(1), instance(2)], extra: [], side: [instance(3)] }

    expect(sameDeckCards(one, { main: [instance(2), instance(1)], extra: [], side: [instance(3)] })).toBe(true)
    expect(sameDeckCards(one, { main: [instance(2), instance(1), instance(3)], extra: [], side: [] })).toBe(false)
  })

  it('una carta que ya está en tu deck usa esa clasificación', () => {
    const reference = [instance(7, ['handtrap'], 'non_engine')]
    const [shared, unknown] = withReferenceClassification([instance(7), instance(9)], reference)

    expect(shared).toMatchObject({ origin: 'non_engine', roles: ['handtrap'] })
    expect(unknown!.origin).toBeNull()
  })
})
