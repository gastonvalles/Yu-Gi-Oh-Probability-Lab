import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type { CardEntry, PatternRequirement } from '../../types'

interface SelectedMonsterFilterSummary {
  copies: number
  label: string
}

export function buildRequirementSummary(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
  selectedGroup: DerivedDeckGroup | null,
  selectedMonsterFilter: SelectedMonsterFilterSummary | null,
): string {
  if (requirement.source === 'group') {
    if (!selectedGroup || selectedGroup.copies === 0) {
      return 'Elegí un grupo con cartas cargadas. Si está vacío, volvé al paso 2 y marcá roles.'
    }

    if (requirement.kind === 'exclude') {
      return requirement.distinct
        ? `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
        : `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} o más de ${selectedGroup.label}.`
    }

    return requirement.distinct
      ? `Esta condición se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
      : `Esta condición se cumple si abrís ${formatInteger(requirement.count)} carta${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
  }

  if (
    requirement.source === 'attribute' ||
    requirement.source === 'level' ||
    requirement.source === 'type' ||
    requirement.source === 'atk' ||
    requirement.source === 'def'
  ) {
    if (!selectedMonsterFilter || selectedMonsterFilter.copies === 0) {
      return 'Elegí un filtro de monstruos con cartas cargadas en el Main Deck.'
    }

    if (requirement.kind === 'exclude') {
      return requirement.distinct
        ? `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre tus monstruos ${selectedMonsterFilter.label}.`
        : `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} monstruo${requirement.count === 1 ? '' : 's'} ${selectedMonsterFilter.label}.`
    }

    return requirement.distinct
      ? `Esta condición se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre tus monstruos ${selectedMonsterFilter.label}.`
      : `Esta condición se cumple si abrís ${formatInteger(requirement.count)} monstruo${requirement.count === 1 ? '' : 's'} ${selectedMonsterFilter.label}.`
  }

  if (selectedCards.length === 0) {
    return 'Elegí primero qué cartas querés revisar en esta condición.'
  }

  const names = selectedCards.map((card) => card.name)
  const cardLabel = names.length === 1 ? names[0] : names.join(', ')

  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre: ${cardLabel}.`
      : `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} o más entre: ${cardLabel}.`
  }

  if (requirement.distinct) {
    return `Esta condición se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} entre: ${cardLabel}.`
  }

  if (selectedCards.length === 1) {
    return `Esta condición se cumple si abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} de ${cardLabel}.`
  }

  return `Cualquiera de estas cartas sirve para esta condición: ${cardLabel}.`
}
