import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type { CardEntry, PatternRequirement } from '../../types'

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
        ? `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
        : `Esta condición solo se cumple si NO abrís ${formatInteger(requirement.count)} copia${requirement.count === 1 ? '' : 's'} o más de ${selectedGroup.label}.`
    }

    return requirement.distinct
      ? `Esta condición se cumple si abrís ${formatInteger(requirement.count)} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
      : `Esta condición se cumple si abrís ${formatInteger(requirement.count)} carta${requirement.count === 1 ? '' : 's'} de ${selectedGroup.label}.`
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
