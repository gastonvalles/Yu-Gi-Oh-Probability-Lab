import { describe, expect, it } from 'vitest'

import { fromPortableConfig, toPortableConfig } from '../app/app-state-codec'
import { createInitialState } from '../app/model'
import { buildActiveRuleSet, buildPatternPresets, getSystemRuleId, normalizeRuleName } from '../app/pattern-presets'
import { getPatternDefinitionKey } from '../app/patterns'
import { patternsReducer, setSystemRuleName, type PatternsState } from '../app/patterns-slice'

const base: PatternsState = { patternsSeeded: true, patternsSeedVersion: 0, patterns: [], disabledGenericRuleIds: [], systemRuleNames: {} }

describe('nombres propios de reglas universales', () => {
  it('renombra las universales y conserva id y condición; las genéricas no se renombran', () => {
    const defaults = buildPatternPresets([])
    const renamed = buildPatternPresets([], { starter_opening: 'Arranque mínimo', starter_extender_opening: 'Otro nombre' })
    const universal = renamed.find((preset) => preset.id === 'starter_opening')!
    const generic = renamed.find((preset) => preset.id === 'starter_extender_opening')!

    expect(universal.title).toBe('Arranque mínimo')
    expect(universal.defaultTitle).toBe('Salida básica')
    expect(universal.pattern.name).toBe('Arranque mínimo')
    expect(universal.pattern.id).toBe(getSystemRuleId('starter_opening'))
    expect(getPatternDefinitionKey(universal.pattern)).toBe(getPatternDefinitionKey(defaults.find((preset) => preset.id === 'starter_opening')!.pattern))
    expect(generic.title).toBe(defaults.find((preset) => preset.id === 'starter_extender_opening')!.title)
  })

  it('el nombre llega a las reglas que se calculan', () => {
    const names = buildActiveRuleSet([], [], [], { starter_opening: 'Arranque mínimo' }).map((pattern) => pattern.name)

    expect(names).toContain('Arranque mínimo')
    expect(names).not.toContain('Salida básica')
  })

  it('un nombre vacío vuelve al del catálogo', () => {
    expect(buildPatternPresets([], { starter_opening: '   ' }).find((preset) => preset.id === 'starter_opening')!.title).toBe('Salida básica')
  })

  it('normaliza espacios y largo', () => {
    expect(normalizeRuleName('  a   b  ')).toBe('a b')
    expect(normalizeRuleName('x'.repeat(200))).toHaveLength(60)
  })

  it('el estado guarda, reemplaza y borra el nombre', () => {
    const named = patternsReducer(base, setSystemRuleName({ ruleId: 'starter_opening', name: ' Arranque ' }))
    expect(named.systemRuleNames).toEqual({ starter_opening: 'Arranque' })

    const replaced = patternsReducer(named, setSystemRuleName({ ruleId: 'starter_opening', name: 'Otro' }))
    expect(replaced.systemRuleNames).toEqual({ starter_opening: 'Otro' })

    expect(patternsReducer(replaced, setSystemRuleName({ ruleId: 'starter_opening', name: '' })).systemRuleNames).toEqual({})
  })

  it('se guarda y se recupera en la configuración portable (y tolera datos viejos o rotos)', () => {
    const state = { ...createInitialState(), systemRuleNames: { starter_opening: 'Arranque' } }
    const portable = toPortableConfig(state)

    expect(fromPortableConfig(portable).systemRuleNames).toEqual({ starter_opening: 'Arranque' })
    expect(fromPortableConfig({ ...portable, systemRuleNames: undefined }).systemRuleNames).toEqual({})
    expect(fromPortableConfig({ ...portable, systemRuleNames: { a: 5, b: '  ', c: 'ok' } }).systemRuleNames).toEqual({ c: 'ok' })
  })
})

describe('versión editada de una regla genérica', () => {
  const generic = buildPatternPresets([]).find((preset) => preset.id === 'starter_extender_opening')!
  const edited = { ...generic.pattern, id: 'edited', name: 'Mi seguimiento', systemRuleId: generic.id, conditions: generic.pattern.conditions.map((c, i) => ({ ...c, quantity: i === 0 ? 2 : 1 })) }

  it('reemplaza a la genérica del catálogo (no cuenta las dos)', () => {
    const names = buildActiveRuleSet([], [edited], []).map((pattern) => pattern.name)

    expect(names).toContain('Mi seguimiento')
    expect(names).not.toContain('Salida con seguimiento')
  })

  it('si la genérica se apaga, tampoco cuenta la editada', () => {
    const names = buildActiveRuleSet([], [edited], [generic.id]).map((pattern) => pattern.name)

    expect(names).not.toContain('Mi seguimiento')
    expect(names).not.toContain('Salida con seguimiento')
  })

  it('se guarda y recupera con su vínculo al catálogo', () => {
    const state = { ...createInitialState(), patterns: [edited] }

    expect(fromPortableConfig(toPortableConfig(state)).patterns[0]!.systemRuleId).toBe(generic.id)
  })
})
