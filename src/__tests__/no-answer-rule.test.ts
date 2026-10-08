import { describe, expect, it } from 'vitest'

import { buildPatternPresets } from '../app/pattern-presets'
import type { CardEntry, CardRole } from '../types'

const card = (id: string, roles: CardRole[]): CardEntry => ({ id, name: id, copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles, needsReview: false })

describe('regla "Sin respuesta yendo 2º"', () => {
  const cards = [card('ash', ['handtrap']), card('nibiru', ['handtrap', 'boardbreaker']), card('lava', ['boardbreaker']), card('trap', ['disruption']), card('starter', ['starter'])]
  const pattern = buildPatternPresets(cards).find((preset) => preset.id === 'no_answer_second_problem')!.pattern

  it('mira solo las 5 cartas iniciales yendo 2º (la que se roba no cuenta)', () => {
    expect(pattern.turnContext).toBe('second')
    expect(pattern.ignoresDraw).toBe(true)
  })

  it('es una sola condición: ninguna Handtrap ni Boardbreaker (la Disruption no cuenta)', () => {
    expect(pattern.conditions).toHaveLength(1)
    expect(pattern.conditions[0]).toMatchObject({ kind: 'exclude', quantity: 1, matcher: { type: 'card_pool' } })
    expect(pattern.conditions[0]!.matcher).toEqual({ type: 'card_pool', value: ['ash', 'nibiru', 'lava'] })
  })
})
