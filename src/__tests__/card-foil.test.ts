import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { foilFrameOf, foilKindOf, foilOf, type FoilKind } from '../app/card-foil'

/** Las 33 rarezas que hay en los datos de precios (TCGplayer) y el efecto de cada una: null = sin brillo. */
const RARITIES: ReadonlyArray<[rarity: string, kind: FoilKind | null]> = [
  ['Common', null],
  ['Promo', null],
  ['Rare', 'rare'],
  ['Platinum Rare', 'rare'],
  ['Super Rare', 'holo'],
  ['Ultra Rare', 'holo'],
  ['Ultimate Rare', 'holo'],
  ['Parallel Rare', 'holo'],
  ['Duel Terminal Normal Parallel Rare', 'holo'],
  ['Duel Terminal Rare Parallel Rare', 'holo'],
  ['Duel Terminal Super Parallel Rare', 'holo'],
  ['Duel Terminal Ultra Parallel Rare', 'holo'],
  ['Duel Terminal Technology Ultra Rare', 'holo'],
  ['Ultra Pharaoh’s Rare', 'holo'],
  ['Emblazoned Ultra Rare', 'holo'],
  ['Secret Rare', 'secret'],
  ['Secret Pharaoh’s Rare', 'secret'],
  ['10000 Secret Rare', 'secret'],
  ['Emblazoned Secret Rare', 'secret'],
  ['Gold Rare', 'gold'],
  ['Premium Gold Rare', 'gold'],
  ['Gold Secret Rare', 'gold'],
  ['Ghost Rare', 'ghost'],
  ['Ghost/Gold Rare', 'ghost'],
  ['Platinum Secret Rare', 'platinum'],
  ['Prismatic Secret Rare', 'prism'],
  ['Quarter Century Secret Rare', 'prism'],
  ['Collector\'s Rare', 'prism'],
  ['Starfoil Rare', 'prism'],
  ['Shatterfoil Rare', 'prism'],
  ['Mosaic Rare', 'prism'],
  ['Grand Master Rare', 'prism'],
  ['Starlight Rare', 'starlight'],
]

describe('foilKindOf: el efecto de cada rareza', () => {
  it.each(RARITIES)('%s → %s', (rarity, kind) => {
    expect(foilKindOf(rarity)).toBe(kind)
  })

  it('no importan las mayúsculas ni los espacios de los bordes, y una rareza que no se conoce (o ninguna) no lleva efecto', () => {
    expect(foilKindOf('  STARLIGHT rare ')).toBe('starlight')
    expect(foilKindOf('Rareza inventada')).toBeNull()
    expect(foilKindOf('')).toBeNull()
    expect(foilKindOf(null)).toBeNull()
    expect(foilKindOf(undefined)).toBeNull()
  })

  it('con cualquier texto devuelve un efecto de la lista o nada, sin fallar', () => {
    const kinds = new Set<string>(RARITIES.flatMap(([, kind]) => (kind ? [kind] : [])))

    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        const kind = foilKindOf(text)

        expect(kind === null || kinds.has(kind)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })
})

describe('foilFrameOf y foilOf', () => {
  it('el marco sale del frameType de YGOPRODeck: péndulo, mágica o trampa, enlace, habilidad y, de lo demás, monstruo', () => {
    expect(foilFrameOf('pendulum_effect')).toBe('pendulum')
    expect(foilFrameOf('fusion_pendulum')).toBe('pendulum')
    expect(foilFrameOf('spell')).toBe('spelltrap')
    expect(foilFrameOf('trap')).toBe('spelltrap')
    expect(foilFrameOf('link')).toBe('link')
    expect(foilFrameOf('skill')).toBe('skill')
    expect(foilFrameOf('effect')).toBe('monster')
    expect(foilFrameOf('xyz')).toBe('monster')
    expect(foilFrameOf(undefined)).toBe('monster')
  })

  it('junta los dos; sin efecto para la rareza, no hay brillo', () => {
    expect(foilOf('Starlight Rare', 'xyz')).toEqual({ kind: 'starlight', frame: 'monster' })
    expect(foilOf('Ultra Rare', 'spell')).toEqual({ kind: 'holo', frame: 'spelltrap' })
    expect(foilOf('Common', 'effect')).toBeNull()
    expect(foilOf(undefined, 'effect')).toBeNull()
  })
})
