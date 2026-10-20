import { describe, expect, it } from 'vitest'

import { getCardEffectFactNames, indexCardEffects, setCardEffectsForTests, type CardEffectData } from '../app/card-effect-data'
import { EFFECT_FACT } from '../app/card-effect-facts'
import CARD_EFFECTS from '../data/card-effects.json'

const data = CARD_EFFECTS as CardEffectData
const index = indexCardEffects(data)
const MASK = Object.values(EFFECT_FACT).reduce((all, bit) => all | bit, 0)

describe('src/data/card-effects.json (lo que escribe scripts/build-card-effects.mjs)', () => {
  it('guarda el commit de los scripts y cubre a la mayoría de las cartas con efectos', () => {
    expect(data.scripts).toMatch(/^[0-9a-f]{7,}$/)
    expect(index.size).toBeGreaterThan(8_000)
  })

  it('cada grupo tiene una máscara válida y no vacía, y ninguna carta está en dos grupos', () => {
    const ids = Object.values(data.cards).flat()

    for (const facts of Object.keys(data.cards)) {
      expect(Number(facts) & ~MASK, facts).toBe(0)
      expect(Number(facts), facts).toBeGreaterThan(0)
    }

    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('las cartas de siempre salen con lo que dicen su script y su texto', () => {
    setCardEffectsForTests(index)

    try {
      // Ash Blossom: efecto rápido, costo (se descarta) y una vez por turno por nombre.
      expect(getCardEffectFactNames(14558127)).toEqual(['quick', 'once', 'hardOnce', 'cost'])
      // Maxx "C": una vez por turno por nombre («You can only use 1 "Maxx "C"" per turn») y costo; su texto es el viejo, sin «(Quick Effect)».
      expect(getCardEffectFactNames(23434538)).toEqual(['once', 'hardOnce', 'cost'])
      // Effect Veiler: tiene un efecto rápido.
      expect(getCardEffectFactNames(38814750)).toContain('quick')
      // Una carta sin script o un monstruo normal no tiene nada confirmado.
      expect(getCardEffectFactNames(89631139)).toEqual([])
      expect(getCardEffectFactNames(-1)).toEqual([])
    } finally {
      setCardEffectsForTests(null)
    }
  })

  it('sin datos cargados no dice nada de ninguna carta', () => {
    setCardEffectsForTests(null)
    expect(getCardEffectFactNames(14558127)).toEqual([])
  })
})
