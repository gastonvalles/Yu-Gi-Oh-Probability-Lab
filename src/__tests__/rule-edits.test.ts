import { describe, expect, it } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { getPatternDefinitionKey } from '../app/patterns'
import {
  RULE_EXAMPLES,
  buildRuleExample,
  duplicateRule,
  findDuplicateRule,
  moveCondition,
  removeRule,
  restoreGenericRule,
  restoreRemovedRule,
} from '../app/rule-edits'
import type { HandPattern } from '../types'

const rule = (name: string, overrides: Partial<HandPattern> = {}): HandPattern => ({
  ...createMatcherPattern(name, 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }]),
  ...overrides,
})

describe('los ejemplos para arrancar una regla', () => {
  it('son cuatro: tres salidas (los de Gastón) y un problema', () => {
    expect(RULE_EXAMPLES.map((example) => example.id)).toEqual(['key-card', 'starter-combo', 'handtraps-second', 'no-interaction'])
    expect(RULE_EXAMPLES.map((example) => example.kind)).toEqual(['opening', 'opening', 'opening', 'problem'])
  })

  it('«Abrir tu carta clave» deja una condición sin elegir y avisa cuál: el editor abre su selector', () => {
    const { pattern, pendingConditionId } = buildRuleExample('key-card', 'Abrir tu carta clave')

    expect(pattern.kind).toBe('opening')
    expect(pattern.name).toBe('')
    expect(pattern.conditions).toHaveLength(1)
    expect(pattern.conditions[0]).toMatchObject({ matcher: null, quantity: 1, kind: 'include' })
    expect(pendingConditionId).toBe(pattern.conditions[0]!.id)
  })

  it('«Starter + pieza de combo» pide las dos (Y) y deja la segunda para elegir', () => {
    const { pattern, pendingConditionId } = buildRuleExample('starter-combo', 'Starter + pieza de combo')

    expect(pattern.logic).toBe('all')
    expect(pattern.conditions.map((entry) => entry.matcher)).toEqual([{ type: 'role', value: 'starter' }, null])
    expect(pendingConditionId).toBe(pattern.conditions[1]!.id)
  })

  it('«2+ Handtraps yendo 2º» queda lista para guardar, con su nombre y contando la carta robada', () => {
    const { pattern, pendingConditionId } = buildRuleExample('handtraps-second', '2+ Handtraps yendo 2º')

    expect(pendingConditionId).toBeNull()
    expect(pattern).toMatchObject({ name: '2+ Handtraps yendo 2º', turnContext: 'second', kind: 'opening' })
    expect(pattern.ignoresDraw).toBeUndefined()
    expect(pattern.conditions[0]).toMatchObject({ matcher: { type: 'role', value: 'handtrap' }, quantity: 2, kind: 'include' })
  })

  it('«Sin interacción» es un problema: ninguna Handtrap y ninguna Disruption, sin el nombre viejo del sistema', () => {
    const { pattern, pendingConditionId } = buildRuleExample('no-interaction', 'Sin interacción')

    expect(pendingConditionId).toBeNull()
    expect(pattern.kind).toBe('problem')
    expect(pattern.logic).toBe('all')
    expect(pattern.name).toBe('')
    expect(pattern.conditions.map((entry) => [entry.kind, entry.matcher])).toEqual([
      ['exclude', { type: 'role', value: 'handtrap' }],
      ['exclude', { type: 'role', value: 'disruption' }],
    ])
  })

  it('cada vez arma ids nuevos (dos reglas creadas del mismo ejemplo no chocan)', () => {
    const first = buildRuleExample('handtraps-second', 'x').pattern
    const second = buildRuleExample('handtraps-second', 'x').pattern

    expect(first.id).not.toBe(second.id)
    expect(first.conditions[0]!.id).not.toBe(second.conditions[0]!.id)
  })
})

describe('duplicar una regla', () => {
  it('es una regla propia nueva que mide lo mismo: ids nuevos, el nombre pedido y sin el vínculo a la genérica', () => {
    const generic = rule('Salida con seguimiento', { systemRuleId: 'starter_extender_opening', needsReview: true })
    const copy = duplicateRule(generic, '  Salida con seguimiento   (copia) ')

    expect(copy.id).not.toBe(generic.id)
    expect(copy.conditions[0]!.id).not.toBe(generic.conditions[0]!.id)
    expect(copy.name).toBe('Salida con seguimiento (copia)')
    expect(copy.systemRuleId).toBeNull()
    expect(copy.needsReview).toBe(false)
    expect(getPatternDefinitionKey(copy)).toBe(getPatternDefinitionKey(generic))
    expect(generic.conditions[0]!.id).toBe(generic.conditions[0]!.id)
  })
})

describe('restaurar la genérica original', () => {
  it('saca sólo la versión editada de esa genérica', () => {
    const edited = rule('Mi seguimiento', { systemRuleId: 'starter_extender_opening' })
    const other = rule('Otra', { systemRuleId: 'no_answer_second_problem' })
    const own = rule('Propia')

    expect(restoreGenericRule([edited, other, own], 'starter_extender_opening')).toEqual([other, own])
  })
})

describe('borrar y deshacer', () => {
  const a = rule('A')
  const b = rule('B')
  const c = rule('C')

  it('borrar guarda la regla y su lugar; deshacer la vuelve a poner donde estaba', () => {
    const { patterns, removed } = removeRule([a, b, c], b.id)

    expect(patterns).toEqual([a, c])
    expect(removed).toEqual({ pattern: b, index: 1 })
    expect(restoreRemovedRule(patterns, removed!)).toEqual([a, b, c])
  })

  it('una regla que no está no se borra; deshacer dos veces no la duplica; si la lista se achicó, va al final', () => {
    expect(removeRule([a], 'nada')).toEqual({ patterns: [a], removed: null })
    expect(restoreRemovedRule([a, b], { pattern: b, index: 0 })).toEqual([a, b])
    expect(restoreRemovedRule([a], { pattern: c, index: 5 })).toEqual([a, c])
  })
})

describe('reordenar las condiciones', () => {
  const pattern = createMatcherPattern('Tres', 'opening', [
    { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
    { matcher: { type: 'role', value: 'searcher' }, quantity: 1, kind: 'include' },
  ])
  const order = (next: HandPattern) => next.conditions.map((entry) => (entry.matcher?.type === 'role' ? entry.matcher.value : ''))

  it('la condición pasa al lugar pedido y las demás se corren', () => {
    expect(order(moveCondition(pattern, 0, 2))).toEqual(['extender', 'searcher', 'starter'])
    expect(order(moveCondition(pattern, 2, 0))).toEqual(['searcher', 'starter', 'extender'])
    expect(order(moveCondition(pattern, 1, 2))).toEqual(['starter', 'searcher', 'extender'])
  })

  it('fuera de rango o al mismo lugar, queda igual (la misma regla)', () => {
    expect(moveCondition(pattern, 1, 1)).toBe(pattern)
    expect(moveCondition(pattern, -1, 0)).toBe(pattern)
    expect(moveCondition(pattern, 0, 3)).toBe(pattern)
  })

  it('el orden no cambia lo que mide la regla (el Lab la cuenta igual)', () => {
    expect(getPatternDefinitionKey(moveCondition(pattern, 0, 2))).toBe(getPatternDefinitionKey(pattern))
  })
})

describe('la regla duplicada', () => {
  const basic = rule('Salida básica')

  it('dice el nombre de la regla que ya mide lo mismo', () => {
    const draft = rule('')

    expect(findDuplicateRule(draft, [{ id: 'starter_opening', name: 'Salida básica', pattern: basic }])).toBe('Salida básica')
  })

  it('no se compara consigo misma, ni la versión editada con su genérica, ni con una regla a medias', () => {
    const editing = rule('Mía')
    const editedGeneric = rule('Mi seguimiento', { systemRuleId: 'starter_opening' })
    const incomplete = { ...rule(''), conditions: [{ ...rule('').conditions[0]!, matcher: null }] }

    expect(findDuplicateRule(editing, [{ id: editing.id, name: 'Mía', pattern: editing }])).toBeNull()
    expect(findDuplicateRule(editedGeneric, [{ id: 'starter_opening', name: 'Salida básica', pattern: basic }])).toBeNull()
    expect(findDuplicateRule(incomplete, [{ id: 'x', name: 'X', pattern: incomplete }])).toBeNull()
  })

  it('con otra cantidad ya no es la misma', () => {
    const two = { ...rule(''), conditions: [{ ...rule('').conditions[0]!, quantity: 2 }] }

    expect(findDuplicateRule(two, [{ id: 'starter_opening', name: 'Salida básica', pattern: basic }])).toBeNull()
  })
})
