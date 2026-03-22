import type { HandPattern, HandPatternCategory, PatternRequirement } from '../types'

export function normalizeHandPatternCategory(
  category: HandPatternCategory | null | undefined,
): HandPatternCategory {
  return category === 'bad' ? 'bad' : 'good'
}

export function normalizePatternName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
}

export function getPatternDefinitionKey(
  pattern: Pick<HandPattern, 'category' | 'matchMode' | 'minimumMatches' | 'allowSharedCards' | 'requirements'>,
): string {
  const requirementKeys = pattern.requirements
    .map((requirement) => getRequirementDefinitionKey(requirement))
    .sort()

  return JSON.stringify({
    allowSharedCards: pattern.allowSharedCards === true,
    category: normalizeHandPatternCategory(pattern.category),
    matchMode: pattern.matchMode,
    minimumMatches: pattern.minimumMatches,
    requirements: requirementKeys,
  })
}

export function getPatternCategorySingular(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'problema' : 'apertura'
}

export function getPatternCategoryPlural(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'problemas' : 'aperturas'
}

export function getPatternCategoryShortLabel(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'Problema' : 'Apertura'
}

function getRequirementDefinitionKey(
  requirement: Pick<PatternRequirement, 'source' | 'groupKey' | 'cardIds' | 'count' | 'kind' | 'distinct'>,
): string {
  return JSON.stringify({
    cardIds: [...requirement.cardIds].sort(),
    count: requirement.count,
    distinct: requirement.distinct === true,
    groupKey: requirement.groupKey,
    kind: requirement.kind,
    source: requirement.source,
  })
}
