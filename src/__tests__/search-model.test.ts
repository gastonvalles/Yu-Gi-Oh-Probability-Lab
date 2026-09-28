import { describe, expect, it } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS } from '../app/card-search'
import {
  buildActiveFilterChips,
  buildFilterSectionSummaries,
  buildSanitizedFilterUpdates,
  sortVisibleSearchResults,
} from '../components/search/search-model'
import { getExactTypeFilterGroups, getRaceFilterGroups, QUICK_TYPE_META } from '../components/search/search-options'
import type { ApiCardSearchResult } from '../ygoprodeck'

function card(ygoprodeckId: number, name: string, cardType: string): ApiCardSearchResult {
  return { ygoprodeckId, name, cardType } as ApiCardSearchResult
}

describe('sortVisibleSearchResults', () => {
  const results = [card(1, 'Zeta', 'Trap Card'), card(2, 'Beta', 'Effect Monster'), card(3, 'Alfa', 'Spell Card')]

  it('mantiene el orden de llegada en el orden base', () => {
    expect(sortVisibleSearchResults(results, 'default')).toBe(results)
  })

  it('agrupa monstruo > magia > trampa y ordena por nombre', () => {
    expect(sortVisibleSearchResults(results, 'name-asc').map((entry) => entry.name)).toEqual(['Beta', 'Alfa', 'Zeta'])
  })
})

describe('buildSanitizedFilterUpdates', () => {
  it('limpia raza, atributo y nivel que no aplican al pasar a Magias', () => {
    const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, quickType: 'spell' as const, race: 'Dragon', attribute: 'DARK', level: '4' }

    expect(
      buildSanitizedFilterUpdates({
        filters,
        exactTypeGroups: getExactTypeFilterGroups('spell'),
        raceGroups: getRaceFilterGroups('spell'),
        formatAllowsLegalityFilter: true,
        showAttribute: QUICK_TYPE_META.spell.showAttribute,
        showLevel: QUICK_TYPE_META.spell.showLevel,
      }),
    ).toEqual({ race: '', attribute: '', level: '' })
  })

  it('no propone cambios si todo es válido', () => {
    expect(
      buildSanitizedFilterUpdates({
        filters: DEFAULT_CARD_SEARCH_FILTERS,
        exactTypeGroups: getExactTypeFilterGroups('all'),
        raceGroups: getRaceFilterGroups('all'),
        formatAllowsLegalityFilter: false,
        showAttribute: true,
        showLevel: true,
      }),
    ).toBeNull()
  })
})

describe('chips y resúmenes de filtros', () => {
  const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, archetype: ' Blue-Eyes ', legalOnly: true }

  it('cada chip sabe cómo quitarse', () => {
    const chips = buildActiveFilterChips({ filters, formatAllowsLegalityFilter: true, formatLabel: 'TCG', raceLabel: 'Raza' })

    expect(chips.map((chip) => [chip.key, chip.value, chip.updates])).toEqual([
      ['archetype', 'Blue-Eyes', { archetype: '' }],
      ['legal-only', 'Sin prohibidas en TCG', { legalOnly: false }],
    ])
  })

  it('resume y abre las secciones con filtros activos', () => {
    const summaries = buildFilterSectionSummaries({
      filters,
      quickTypeMeta: QUICK_TYPE_META.all,
      formatAllowsLegalityFilter: true,
      formatLabel: 'TCG',
    })

    expect(summaries).toEqual({
      text: 'Blue-Eyes',
      textOpen: true,
      characteristics: 'Sin prohibidas en TCG',
      characteristicsOpen: true,
    })
  })
})
