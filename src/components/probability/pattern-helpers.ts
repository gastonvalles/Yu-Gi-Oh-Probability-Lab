import { getPatternCategorySingular } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type { CardEntry, HandPattern, PatternRequirement } from '../../types'

export function getPatternCategoryLabel(pattern: HandPattern): string {
  return getPatternCategorySingular(pattern.category)
}

function getPatternCategoryWithArticle(pattern: HandPattern): string {
  const category = getPatternCategoryLabel(pattern)

  return category === 'problema' ? `Este ${category}` : `Esta ${category}`
}

export function getRequiredMatches(pattern: HandPattern): number {
  if (pattern.matchMode === 'any') {
    return 1
  }

  if (pattern.matchMode === 'all') {
    return pattern.requirements.length
  }

  return Math.max(1, Math.min(pattern.minimumMatches, Math.max(pattern.requirements.length, 1)))
}

export function buildPatternMatchExplanation(pattern: HandPattern): string {
  const categoryLabel = getPatternCategoryWithArticle(pattern)
  const reuseSuffix =
    !pattern.allowSharedCards && pattern.requirements.length > 1
      ? ' Una misma carta no puede completar dos partes a la vez.'
      : ''

  if (pattern.requirements.length <= 1) {
    return `${categoryLabel} aparece si la mano cumple esta parte.${reuseSuffix}`
  }

  if (pattern.matchMode === 'all') {
    return `${categoryLabel} aparece si la mano cumple todas las partes de abajo.${reuseSuffix}`
  }

  if (pattern.matchMode === 'any') {
    return `${categoryLabel} aparece si la mano cumple al menos una de las partes de abajo.${reuseSuffix}`
  }

  return `${categoryLabel} aparece si la mano cumple al menos ${formatInteger(
    getRequiredMatches(pattern),
  )} partes.${reuseSuffix}`
}

export function buildRequirementSummary(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
  selectedGroup: DerivedDeckGroup | null,
): string {
  if (requirement.source === 'group') {
    if (!selectedGroup || selectedGroup.copies === 0) {
      return 'Elegí un grupo con cartas cargadas. Si está vacío, volvé al paso 2 y marcá roles.'
    }

    if (requirement.kind === 'exclude') {
      return requirement.distinct
        ? `Esta parte solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
        : `Esta parte solo se cumple si NO abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} o más de ${selectedGroup.label}.`
    }

    return requirement.distinct
      ? `Esta parte se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
      : `Esta parte se cumple si abrís ${formatInteger(requirement.count)} carta${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
  }

  if (selectedCards.length === 0) {
    return 'Elegí primero qué cartas querés revisar en esta parte.'
  }

  const names = selectedCards.map((card) => card.name)
  const cardLabel = names.length === 1 ? names[0] : names.join(', ')

  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `Esta parte solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre: ${cardLabel}.`
      : `Esta parte solo se cumple si NO abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} o más entre: ${cardLabel}.`
  }

  if (requirement.distinct) {
    return `Esta parte se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre: ${cardLabel}.`
  }

  if (selectedCards.length === 1) {
    return `Esta parte se cumple si abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} de ${cardLabel}.`
  }

  return `Cualquiera de estas cartas sirve para esta parte: ${cardLabel}.`
}
