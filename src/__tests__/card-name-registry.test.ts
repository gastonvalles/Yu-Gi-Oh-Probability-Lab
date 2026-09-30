/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { createAbsentCardEntry, parseYgoprodeckId, readCardNames, rememberCardNames } from '../app/card-name-registry'

describe('registro de nombres de cartas', () => {
  beforeEach(() => localStorage.clear())

  it('recuerda nombres para cartas que después salen del deck', () => {
    rememberCardNames([{ id: 'card-1', name: 'Pre-Preparation of Rites' }])
    expect(readCardNames()['card-1']).toBe('Pre-Preparation of Rites')
  })

  it('lee el id de YGOPRODeck del id interno', () => {
    expect(parseYgoprodeckId('card-13048472')).toBe(13048472)
    expect(parseYgoprodeckId('manual-x')).toBeNull()
  })

  it('la entrada ausente no tiene copias (no cuenta para cálculos ni se puede elegir)', () => {
    expect(createAbsentCardEntry('card-1', 'Pre-Preparation of Rites')).toMatchObject({
      copies: 0,
      name: 'Pre-Preparation of Rites (fuera del deck)',
    })
  })
})
