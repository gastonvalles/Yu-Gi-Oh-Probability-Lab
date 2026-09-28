import type { CardSearchFilters } from '../../app/card-search'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { collectFilterValues, type FilterOptionGroup, type QuickTypeMeta, type SearchSortOrder } from './search-options'

export interface ActiveFilterChip {
  key: string
  label: string
  value: string
  updates: Partial<CardSearchFilters>
}

export interface FilterSectionSummaries {
  text: string
  textOpen: boolean
  characteristics: string
  characteristicsOpen: boolean
}

export function sortVisibleSearchResults(
  results: ApiCardSearchResult[],
  sortOrder: SearchSortOrder,
): ApiCardSearchResult[] {
  if (sortOrder === 'default') {
    // Keep fetch order as-is: grouping by type here would re-shuffle already-visible
    // cards every time a new page loads a card of a "higher" type, breaking scroll/click.
    return results
  }

  return [...results].sort((left, right) => {
    const typeDifference = getSearchTypePriority(left) - getSearchTypePriority(right)

    if (typeDifference !== 0) {
      return typeDifference
    }

    const nameDifference =
      sortOrder === 'name-desc'
        ? right.name.localeCompare(left.name)
        : left.name.localeCompare(right.name)

    if (nameDifference !== 0) {
      return nameDifference
    }

    return left.ygoprodeckId - right.ygoprodeckId
  })
}

function getSearchTypePriority(card: ApiCardSearchResult): number {
  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''

  if (cardType.includes('monster')) {
    return 0
  }

  if (cardType.includes('spell')) {
    return 1
  }

  if (cardType.includes('trap')) {
    return 2
  }

  return 3
}

export function buildSanitizedFilterUpdates({
  filters,
  exactTypeGroups,
  raceGroups,
  formatAllowsLegalityFilter,
  showAttribute,
  showLevel,
}: {
  filters: CardSearchFilters
  exactTypeGroups: FilterOptionGroup[]
  raceGroups: FilterOptionGroup[]
  formatAllowsLegalityFilter: boolean
  showAttribute: boolean
  showLevel: boolean
}): Partial<CardSearchFilters> | null {
  const updates: Partial<CardSearchFilters> = {}
  const validExactTypes = collectFilterValues(exactTypeGroups)
  const validRaces = collectFilterValues(raceGroups)

  if (filters.exactType.trim().length > 0 && !validExactTypes.has(filters.exactType)) {
    updates.exactType = ''
  }

  if (filters.race.trim().length > 0 && !validRaces.has(filters.race)) {
    updates.race = ''
  }

  if (!showAttribute && filters.attribute.trim().length > 0) {
    updates.attribute = ''
  }

  if (!showLevel && filters.level.trim().length > 0) {
    updates.level = ''
  }

  if (!formatAllowsLegalityFilter && filters.legalOnly) {
    updates.legalOnly = false
  }

  return Object.keys(updates).length > 0 ? updates : null
}

export function buildActiveFilterChips({
  filters,
  formatAllowsLegalityFilter,
  formatLabel,
  raceLabel,
}: {
  filters: CardSearchFilters
  formatAllowsLegalityFilter: boolean
  formatLabel: string
  raceLabel: string
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []

  if (filters.archetype.trim().length > 0) {
    chips.push({
      key: 'archetype',
      label: 'Arquetipo',
      value: filters.archetype.trim(),
      updates: { archetype: '' },
    })
  }

  if (filters.description.trim().length > 0) {
    chips.push({
      key: 'description',
      label: 'Texto EN',
      value: filters.description.trim(),
      updates: { description: '' },
    })
  }

  if (filters.exactType.trim().length > 0) {
    chips.push({
      key: 'exact-type',
      label: 'Tipo',
      value: filters.exactType.trim(),
      updates: { exactType: '' },
    })
  }

  if (filters.attribute.trim().length > 0) {
    chips.push({
      key: 'attribute',
      label: 'Atributo',
      value: filters.attribute.trim(),
      updates: { attribute: '' },
    })
  }

  if (filters.race.trim().length > 0) {
    chips.push({
      key: 'race',
      label: raceLabel,
      value: filters.race.trim(),
      updates: { race: '' },
    })
  }

  if (filters.level.trim().length > 0) {
    chips.push({
      key: 'level',
      label: 'Nivel',
      value: filters.level.trim(),
      updates: { level: '' },
    })
  }

  if (formatAllowsLegalityFilter && filters.legalOnly) {
    chips.push({
      key: 'legal-only',
      label: 'Legalidad',
      value: `Sin prohibidas en ${formatLabel}`,
      updates: { legalOnly: false },
    })
  }

  return chips
}

function buildSectionSummary(parts: string[], emptyLabel = 'Sin filtros'): string {
  const summary = parts.filter((part) => part.length > 0).join(' · ')
  return summary.length > 0 ? summary : emptyLabel
}

export function buildFilterSectionSummaries({
  filters,
  quickTypeMeta,
  formatAllowsLegalityFilter,
  formatLabel,
}: {
  filters: CardSearchFilters
  quickTypeMeta: QuickTypeMeta
  formatAllowsLegalityFilter: boolean
  formatLabel: string
}): FilterSectionSummaries {
  const archetype = filters.archetype.trim()
  const description = filters.description.trim()
  const exactType = filters.exactType.trim()
  const race = filters.race.trim()
  const attribute = filters.attribute.trim()
  const level = filters.level.trim()

  return {
    text: buildSectionSummary([archetype, description ? `Texto: ${description}` : '']),
    textOpen: archetype.length > 0 || description.length > 0,
    characteristics: buildSectionSummary([
      exactType,
      race,
      quickTypeMeta.showAttribute ? attribute : '',
      quickTypeMeta.showLevel && level ? `${quickTypeMeta.levelLabel}: ${level}` : '',
      formatAllowsLegalityFilter && filters.legalOnly ? `Sin prohibidas en ${formatLabel}` : '',
    ]),
    characteristicsOpen:
      exactType.length > 0 || race.length > 0 || attribute.length > 0 || level.length > 0 || filters.legalOnly,
  }
}
