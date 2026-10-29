import { buildDerivedDeckGroupMap } from './app/deck-groups'
import { getMonsterRequirementSourceLabel, isMonsterPropertyMatcher } from './app/card-attributes'
import { getRequiredMatches } from './app/pattern-engine'
import {
  countCardsMissingOrigin,
  countCardsMissingRoles,
  countCardsPendingReview,
} from './app/role-step'
import {
  getConditionSource,
  resolveConditionCardIds,
} from './app/patterns'
import { t } from './i18n'
import type { CardEntry, CalculatorState, ValidationIssue } from './types'

export function validateCalculationState(state: CalculatorState): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!Number.isInteger(state.deckSize) || state.deckSize < 1) {
    issues.push({
      level: 'error',
      message: t('rules.validation.deckSizeInvalid'),
    })
  }

  if (!Number.isInteger(state.handSize) || state.handSize < 1) {
    issues.push({
      level: 'error',
      message: t('rules.validation.handSizeInvalid'),
    })
  }

  if (Number.isInteger(state.deckSize) && state.deckSize < 40) {
    issues.push({
      level: 'error',
      message: t('rules.validation.deckTooSmall'),
    })
  }

  if (Number.isInteger(state.deckSize) && state.deckSize > 60) {
    issues.push({
      level: 'warning',
      message: t('rules.validation.deckTooBig'),
    })
  }

  if (state.handSize > state.deckSize) {
    issues.push({
      level: 'error',
      message: t('rules.validation.handBiggerThanDeck'),
    })
  }

  if (state.cards.length === 0) {
    issues.push({
      level: 'error',
      message: t('rules.validation.noCards'),
    })
  } else {
    const missingOriginCount = countCardsMissingOrigin(state.cards)
    const missingRoleCount = countCardsMissingRoles(state.cards)
    const pendingReviewCount = countCardsPendingReview(state.cards)

    if (missingOriginCount > 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.missingOrigin'),
      })
    }

    if (missingRoleCount > 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.missingRoles'),
      })
    }

    if (pendingReviewCount > 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.pendingReview'),
      })
    }
  }

  const normalizedNames = new Map<string, string>()

  for (const card of state.cards) {
    const trimmedName = card.name.trim()

    if (trimmedName.length === 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.cardNeedsName'),
      })
      continue
    }

    const normalizedName = trimmedName.toLowerCase()
    if (normalizedNames.has(normalizedName)) {
      issues.push({
        level: 'error',
        message: t('rules.validation.duplicateName', { name: trimmedName }),
      })
    } else {
      normalizedNames.set(normalizedName, trimmedName)
    }

    if (!Number.isInteger(card.copies) || card.copies < 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.copiesInvalid', { name: trimmedName }),
      })
    }
  }

  const definedCopies = state.cards.reduce((total, card) => total + Math.max(0, card.copies), 0)

  if (definedCopies > state.deckSize) {
    issues.push({
      level: 'error',
      message: t('rules.validation.copiesOverDeck'),
    })
  }

  if (definedCopies < state.deckSize) {
    issues.push({
      level: 'warning',
      message: t('rules.validation.missingCopies', { count: state.deckSize - definedCopies }),
    })
  }

  if (state.patterns.length === 0) {
    issues.push({
      level: 'error',
      message: t('rules.validation.noRules'),
    })
  }

  const cardById = new Map(state.cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(state.cards)

  for (const pattern of state.patterns) {
    const patternName = pattern.name || t('rules.validation.unnamedRule')

    if (pattern.needsReview) {
      issues.push({
        level: 'error',
        message: t('rules.validation.ruleNeedsReview', { name: patternName }),
      })
      continue
    }

    if (pattern.conditions.length === 0) {
      issues.push({
        level: 'error',
        message: t('rules.validation.ruleNoRequirements', { name: patternName }),
      })
      continue
    }

    const requiredMatches = getRequiredMatches(pattern)

    if (requiredMatches > pattern.conditions.length) {
      issues.push({
        level: 'error',
        message: t('rules.validation.ruleTooManyRequired', { name: patternName }),
      })
    }

    for (const requirement of pattern.conditions) {
      const source = getConditionSource(requirement)

      if (source === 'group' && !requirement.matcher) {
        issues.push({
          level: 'error',
          message: t('rules.validation.conditionNoGroup', { name: patternName }),
        })
        continue
      }

      if (isMonsterPropertyMatcher(requirement.matcher) && !getMonsterRequirementSourceLabel(requirement.matcher)) {
        issues.push({
          level: 'error',
          message: t('rules.validation.conditionNoMonsterValue', { name: patternName }),
        })
        continue
      }

      const uniqueCardIds = resolveConditionCardIds(requirement, groupsByKey, state.cards)

      if (uniqueCardIds.length === 0) {
        issues.push(
          source === 'group'
            ? {
                level: 'warning',
                message: t('rules.validation.groupEmpty', { name: patternName }),
              }
            : isMonsterPropertyMatcher(requirement.matcher)
              ? {
                  level: 'warning',
                  message: t('rules.validation.noMonsters', {
                    name: patternName,
                    filter: getMonsterRequirementSourceLabel(requirement.matcher) ?? t('rules.validation.noMonstersFilter'),
                  }),
                }
            : // Un arquetipo o un tipo de carta se arma con lo que hay en el deck: si no hay ninguna, el patrón sigue (vale 0) y se avisa; no es un requisito sin elegir, y no bloquea el cálculo.
              requirement.matcher?.type === 'archetype' || requirement.matcher?.type === 'card_type'
              ? {
                  level: 'warning',
                  message: t('rules.validation.requirementNotInDeck', { name: patternName }),
                }
              : {
                  level: 'error',
                  message: t('rules.validation.requirementNoCards', { name: patternName }),
                },
        )
        continue
      }

      if (!Number.isInteger(requirement.quantity) || requirement.quantity < 1) {
        issues.push({
          level: 'error',
          message: t('rules.validation.quantityInvalid', { name: patternName }),
        })
      }

      const cards = uniqueCardIds
        .map((cardId) => cardById.get(cardId))
        .filter((card): card is CardEntry => Boolean(card))

      if (cards.length !== uniqueCardIds.length) {
        issues.push({
          level: 'error',
          message: t('rules.validation.cardGone', { name: patternName }),
        })
        continue
      }

      if (requirement.kind === 'include') {
        const totalCopies = cards.reduce((total, card) => total + card.copies, 0)
        const distinctAvailable = cards.filter((card) => card.copies > 0).length

        if (requirement.distinct) {
          if (distinctAvailable < requirement.quantity) {
            issues.push({
              level: 'warning',
              message: t('rules.validation.poolTooFewNames', { count: requirement.quantity, name: patternName, available: distinctAvailable }),
            })
          }
        } else if (totalCopies < requirement.quantity) {
          issues.push({
            level: 'warning',
            message: t('rules.validation.poolTooFewCopies', { count: requirement.quantity, name: patternName, total: totalCopies }),
          })
        }
      }

      if (requirement.quantity > state.handSize && requirement.kind === 'include') {
        issues.push({
          level: 'warning',
          message: t('rules.validation.quantityOverHand', { name: patternName }),
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
