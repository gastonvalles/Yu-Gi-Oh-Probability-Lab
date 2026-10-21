import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { FOIL_KINDS, foilFrameOf, foilKindOf, foilOf, type FoilKind } from '../app/card-foil'

/** Las 33 rarezas que hay en los datos de precios (TCGplayer) y el efecto de cada una: null = sin brillo. */
const RARITIES: ReadonlyArray<[rarity: string, kind: FoilKind | null]> = [
  ['Common', null],
  ['Promo', null],
  ['Rare', 'rare'],
  ['Platinum Rare', 'platinum'],
  ['Super Rare', 'super'],
  ['Ultra Rare', 'ultra'],
  ['Ultimate Rare', 'ultimate'],
  ['Parallel Rare', 'parallel'],
  ['Duel Terminal Normal Parallel Rare', 'parallel'],
  ['Duel Terminal Rare Parallel Rare', 'parallel'],
  ['Duel Terminal Super Parallel Rare', 'parallel'],
  ['Duel Terminal Ultra Parallel Rare', 'parallel'],
  ['Duel Terminal Technology Ultra Rare', 'ultra'],
  ['Ultra Pharaoh’s Rare', 'pharaoh'],
  ['Secret Pharaoh’s Rare', 'pharaoh'],
  ['Emblazoned Ultra Rare', 'ultra'],
  ['Secret Rare', 'secret'],
  ['10000 Secret Rare', 'secret'],
  ['Emblazoned Secret Rare', 'secret'],
  ['Gold Rare', 'gold'],
  ['Premium Gold Rare', 'gold'],
  ['Gold Secret Rare', 'gold'],
  ['Ghost/Gold Rare', 'gold'],
  ['Ghost Rare', 'ghost'],
  ['Platinum Secret Rare', 'platinum'],
  ['Prismatic Secret Rare', 'prismatic'],
  ['Quarter Century Secret Rare', 'quarter'],
  ["Collector's Rare", 'collector'],
  ['Starfoil Rare', 'starfoil'],
  ['Shatterfoil Rare', 'shatterfoil'],
  ['Mosaic Rare', 'mosaic'],
  ['Grand Master Rare', 'grand'],
  ['Starlight Rare', 'starlight'],
]

describe('foilKindOf: el efecto de cada rareza', () => {
  it.each(RARITIES)('%s → %s', (rarity, kind) => {
    expect(foilKindOf(rarity)).toBe(kind)
  })

  it('las dieciocho familias se usan y ninguna rareza de los datos cae en una que no existe: las parecidas ya no comparten efecto', () => {
    const used = new Set(RARITIES.flatMap(([, kind]) => (kind ? [kind] : [])))

    expect([...used].sort()).toEqual([...FOIL_KINDS].sort())
    expect(FOIL_KINDS).toHaveLength(18)
    // Las que se confundían (Super y Ultra, Secret y Platinum, Prismatic y Quarter Century…) son efectos distintos.
    expect(new Set(['Super Rare', 'Ultra Rare', 'Ultimate Rare', 'Secret Rare', 'Platinum Secret Rare', 'Prismatic Secret Rare', 'Quarter Century Secret Rare', 'Starfoil Rare', 'Shatterfoil Rare', 'Mosaic Rare'].map(foilKindOf)).size).toBe(10)
  })

  it('no importan las mayúsculas ni los espacios de los bordes, y una rareza que no se conoce (o ninguna) no lleva efecto', () => {
    expect(foilKindOf('  STARLIGHT rare ')).toBe('starlight')
    expect(foilKindOf('Rareza inventada')).toBeNull()
    expect(foilKindOf('')).toBeNull()
    expect(foilKindOf(null)).toBeNull()
    expect(foilKindOf(undefined)).toBeNull()
  })

  it('con cualquier texto devuelve un efecto de la lista o nada, sin fallar', () => {
    const kinds = new Set<string>(FOIL_KINDS)

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

  it('un arte extendido (u overframe) no tiene ventana: el brillo cubre toda la carta, sea cual sea el marco', () => {
    expect(foilFrameOf('effect', 'Extended Art')).toBe('full')
    expect(foilFrameOf('spell', 'Overframe')).toBe('full')
    expect(foilFrameOf('pendulum_effect', 'Full Art')).toBe('full')
    // Un arte alternativo sí cabe en la ventana de siempre.
    expect(foilFrameOf('effect', 'Alternate Art')).toBe('monster')
    expect(foilFrameOf('effect', '')).toBe('monster')
  })

  it('junta los tres; sin efecto para la rareza, no hay brillo', () => {
    expect(foilOf('Starlight Rare', 'xyz')).toEqual({ kind: 'starlight', frame: 'monster' })
    expect(foilOf('Ultra Rare', 'spell')).toEqual({ kind: 'ultra', frame: 'spelltrap' })
    expect(foilOf('Ultra Rare', 'effect', 'Extended Art')).toEqual({ kind: 'ultra', frame: 'full' })
    expect(foilOf('Common', 'effect')).toBeNull()
    expect(foilOf(undefined, 'effect')).toBeNull()
  })
})
