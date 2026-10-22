import type { HandPattern, PatternCondition, PatternKind } from '../types'
import { createPattern, createPatternRequirement } from './pattern-factory'
import { normalizeRuleName } from './pattern-presets'
import { getPatternDefinitionKey } from './patterns'
import { createId } from './utils'

/**
 * Lo que se le hace a una regla entera desde la lista o el editor del Lab: arrancar desde un ejemplo, duplicarla, volver a la genérica original, borrarla
 * (y deshacerlo) y reordenar sus condiciones. Funciones puras sobre los datos guardados: el store y el motor del Lab no cambian.
 */

/** Los ejemplos para arrancar una regla: los tres de Gastón y uno de problema. */
export type RuleExampleId = 'key-card' | 'starter-combo' | 'handtraps-second' | 'no-interaction'

export const RULE_EXAMPLES: ReadonlyArray<{ id: RuleExampleId; kind: PatternKind }> = [
  { id: 'key-card', kind: 'opening' },
  { id: 'starter-combo', kind: 'opening' },
  { id: 'handtraps-second', kind: 'opening' },
  { id: 'no-interaction', kind: 'problem' },
]

export interface RuleExample {
  pattern: HandPattern
  /** La condición que falta completar (el editor abre su selector en «Cartas»), o null si la regla ya se puede guardar. */
  pendingConditionId: string | null
}

const condition = (overrides: Partial<PatternCondition>): PatternCondition => ({ ...createPatternRequirement(), ...overrides })

/**
 * Arma la regla de un ejemplo. `title` es el nombre que se ve en la tarjeta del ejemplo: sólo lo lleva la regla que ya está lista («2+ Handtraps yendo 2º»).
 * «Sin interacción» queda sin nombre a propósito (al guardar se usa la frase): ese nombre está en la lista de reglas viejas del sistema que se borran al migrar.
 */
export function buildRuleExample(id: RuleExampleId, title: string): RuleExample {
  const base = createPattern('', undefined, id === 'no-interaction' ? 'problem' : 'opening')

  switch (id) {
    case 'key-card': {
      const pick = condition({})
      return { pattern: { ...base, conditions: [pick] }, pendingConditionId: pick.id }
    }
    case 'starter-combo': {
      const pick = condition({})
      return {
        pattern: { ...base, logic: 'all', minimumConditionMatches: 2, conditions: [condition({ matcher: { type: 'role', value: 'starter' } }), pick] },
        pendingConditionId: pick.id,
      }
    }
    case 'handtraps-second':
      return {
        pattern: { ...base, name: title, turnContext: 'second', conditions: [condition({ matcher: { type: 'role', value: 'handtrap' }, quantity: 2 })] },
        pendingConditionId: null,
      }
    case 'no-interaction':
      return {
        pattern: {
          ...base,
          logic: 'all',
          minimumConditionMatches: 2,
          conditions: [
            condition({ matcher: { type: 'role', value: 'handtrap' }, kind: 'exclude' }),
            condition({ matcher: { type: 'role', value: 'disruption' }, kind: 'exclude' }),
          ],
        },
        pendingConditionId: null,
      }
  }
}

/** Una copia nueva de la regla, como regla propia (sin el vínculo a la genérica): ids nuevos para ella y sus condiciones. */
export function duplicateRule(pattern: HandPattern, name: string): HandPattern {
  return {
    ...pattern,
    id: createId('pattern'),
    name: normalizeRuleName(name),
    systemRuleId: null,
    needsReview: false,
    conditions: pattern.conditions.map((entry) => ({ ...entry, id: createId('req') })),
  }
}

/** «Restaurar la original» de una genérica: se va su versión editada y vuelve a contar la del catálogo. */
export function restoreGenericRule(patterns: readonly HandPattern[], presetId: string): HandPattern[] {
  return patterns.filter((pattern) => pattern.systemRuleId !== presetId)
}

/** Lo necesario para deshacer un borrado: la regla y dónde estaba. */
export interface RemovedRule {
  pattern: HandPattern
  index: number
}

export function removeRule(patterns: readonly HandPattern[], patternId: string): { patterns: HandPattern[]; removed: RemovedRule | null } {
  const index = patterns.findIndex((pattern) => pattern.id === patternId)

  if (index < 0) {
    return { patterns: [...patterns], removed: null }
  }

  return { patterns: patterns.filter((_, position) => position !== index), removed: { pattern: patterns[index]!, index } }
}

/** Vuelve a poner la regla borrada en su lugar (o al final, si la lista se achicó). Si ya está, no la repite. */
export function restoreRemovedRule(patterns: readonly HandPattern[], removed: RemovedRule): HandPattern[] {
  if (patterns.some((pattern) => pattern.id === removed.pattern.id)) {
    return [...patterns]
  }

  const index = Math.min(removed.index, patterns.length)

  return [...patterns.slice(0, index), removed.pattern, ...patterns.slice(index)]
}

/** La condición `from` pasa al lugar `to` (las demás se corren). Fuera de rango, la regla queda igual. */
export function moveCondition(pattern: HandPattern, from: number, to: number): HandPattern {
  const count = pattern.conditions.length

  if (from === to || from < 0 || to < 0 || from >= count || to >= count) {
    return pattern
  }

  const conditions = [...pattern.conditions]
  const [moved] = conditions.splice(from, 1)
  conditions.splice(to, 0, moved!)

  return { ...pattern, conditions }
}

/** Una regla con la que comparar el borrador: su id (el del catálogo o el de la regla propia), su nombre y lo que mide. */
export interface RuleCandidate {
  id: string
  name: string
  pattern: HandPattern
}

/**
 * Si el borrador mide exactamente lo mismo que otra regla que ya cuenta, el nombre de esa regla (el Lab no la contaría dos veces). No se compara consigo misma
 * ni, si es la versión editada de una genérica, con esa genérica.
 */
export function findDuplicateRule(draft: HandPattern, candidates: readonly RuleCandidate[]): string | null {
  if (draft.conditions.length === 0 || draft.conditions.some((entry) => entry.matcher === null)) {
    return null
  }

  const key = getPatternDefinitionKey(draft)
  const match = candidates.find(
    (candidate) => candidate.id !== draft.id && candidate.id !== draft.systemRuleId && getPatternDefinitionKey(candidate.pattern) === key,
  )

  return match?.name ?? null
}
