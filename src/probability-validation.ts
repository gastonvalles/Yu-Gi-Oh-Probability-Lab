import { buildDerivedDeckGroupMap, resolveRequirementCardIds } from './app/deck-groups'
import { getRequiredMatches } from './app/pattern-engine'
import { normalizeHandPatternCategory } from './app/patterns'
import type { CardEntry, CalculatorState, ValidationIssue } from './types'

export function validateCalculationState(state: CalculatorState): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!Number.isInteger(state.deckSize) || state.deckSize < 1) {
    issues.push({
      level: 'error',
      message: 'El tamaño del deck debe ser un entero positivo.',
    })
  }

  if (!Number.isInteger(state.handSize) || state.handSize < 1) {
    issues.push({
      level: 'error',
      message: 'El tamaño de la mano inicial debe ser un entero positivo.',
    })
  }

  if (Number.isInteger(state.deckSize) && state.deckSize < 40) {
    issues.push({
      level: 'error',
      message: 'El Main Deck debe tener al menos 40 cartas para calcular la probabilidad exacta.',
    })
  }

  if (Number.isInteger(state.deckSize) && state.deckSize > 60) {
    issues.push({
      level: 'warning',
      message: 'En Yu-Gi-Oh! el Main Deck suele estar entre 40 y 60 cartas.',
    })
  }

  if (state.handSize > state.deckSize) {
    issues.push({
      level: 'error',
      message: 'La mano inicial no puede ser más grande que el deck.',
    })
  }

  if (state.cards.length === 0) {
    issues.push({
      level: 'error',
      message: 'Agregá al menos una carta o grupo de cartas.',
    })
  }

  const normalizedNames = new Map<string, string>()

  for (const card of state.cards) {
    const trimmedName = card.name.trim()

    if (trimmedName.length === 0) {
      issues.push({
        level: 'error',
        message: 'Cada carta o grupo debe tener un nombre.',
      })
      continue
    }

    const normalizedName = trimmedName.toLowerCase()
    if (normalizedNames.has(normalizedName)) {
      issues.push({
        level: 'error',
        message: `El nombre "${trimmedName}" está repetido. Usá nombres únicos para evitar ambigüedad.`,
      })
    } else {
      normalizedNames.set(normalizedName, trimmedName)
    }

    if (!Number.isInteger(card.copies) || card.copies < 0) {
      issues.push({
        level: 'error',
        message: `La cantidad de "${trimmedName}" debe ser un entero mayor o igual a 0.`,
      })
    }
  }

  const definedCopies = state.cards.reduce((total, card) => total + Math.max(0, card.copies), 0)

  if (definedCopies > state.deckSize) {
    issues.push({
      level: 'error',
      message: 'La suma de copias definidas supera el tamaño del deck.',
    })
  }

  if (definedCopies < state.deckSize) {
    issues.push({
      level: 'warning',
      message: `Faltan ${state.deckSize - definedCopies} cartas. Se tratarán como "Otras cartas".`,
    })
  }

  if (state.patterns.length === 0) {
    issues.push({
      level: 'error',
      message: 'Agregá al menos un chequeo de apertura o problema.',
    })
  }

  const cardById = new Map(state.cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(state.cards)

  for (const pattern of state.patterns) {
    if (pattern.requirements.length === 0) {
      issues.push({
        level: 'error',
        message: `El patrón "${pattern.name || 'sin nombre'}" no tiene requisitos.`,
      })
      continue
    }

    const requiredMatches = getRequiredMatches(pattern)

    if (requiredMatches > pattern.requirements.length) {
      issues.push({
        level: 'error',
        message: `El patrón "${pattern.name || 'sin nombre'}" pide más requisitos de los que existen.`,
      })
    }

    for (const requirement of pattern.requirements) {
      const patternName = pattern.name || 'sin nombre'

      if (requirement.source === 'group' && !requirement.groupKey) {
        issues.push({
          level: 'error',
          message: `El patrón "${patternName}" tiene una condición sin grupo seleccionado.`,
        })
        continue
      }

      const uniqueCardIds = resolveRequirementCardIds(requirement, groupsByKey)

      if (uniqueCardIds.length === 0) {
        issues.push(
          requirement.source === 'group'
            ? {
                level: 'warning',
                message: `El patrón "${patternName}" usa un grupo vacío. Marcá roles en el deck o elegí otro grupo.`,
              }
            : {
                level: 'error',
                message: `El patrón "${patternName}" tiene un requisito sin cartas seleccionadas.`,
              },
        )
        continue
      }

      if (!Number.isInteger(requirement.count) || requirement.count < 1) {
        issues.push({
          level: 'error',
          message: `El patrón "${patternName}" tiene una cantidad inválida en uno de sus requisitos.`,
        })
      }

      const cards = uniqueCardIds
        .map((cardId) => cardById.get(cardId))
        .filter((card): card is CardEntry => Boolean(card))

      if (cards.length !== uniqueCardIds.length) {
        issues.push({
          level: 'error',
          message: `El patrón "${patternName}" referencia una carta que ya no existe.`,
        })
        continue
      }

      if (requirement.kind === 'include') {
        const totalCopies = cards.reduce((total, card) => total + card.copies, 0)
        const distinctAvailable = cards.filter((card) => card.copies > 0).length

        if (requirement.distinct) {
          if (distinctAvailable < requirement.count) {
            issues.push({
              level: 'warning',
              message: `El patrón "${patternName}" pide ${requirement.count} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} en una pool que solo tiene ${distinctAvailable}.`,
            })
          }
        } else if (totalCopies < requirement.count) {
          issues.push({
            level: 'warning',
            message: `El patrón "${patternName}" pide ${requirement.count} copias en una pool que solo suma ${totalCopies}.`,
          })
        }
      }

      if (requirement.count > state.handSize && requirement.kind === 'include') {
        issues.push({
          level: 'warning',
          message: `El patrón "${patternName}" exige más cartas de las que entran en la mano inicial.`,
        })
      }
    }
  }

  return dedupeIssues(issues)
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  const uniqueIssues: ValidationIssue[] = []

  for (const issue of issues) {
    const key = `${issue.level}:${issue.message}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueIssues.push(issue)
  }

  return uniqueIssues
}
