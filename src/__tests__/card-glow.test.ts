import { describe, expect, it } from 'vitest'
import { chainFeed, type ChainStep } from '../app/auto/chain-feed'
import { actingOf, glowOf, pileGlowOf } from '../app/card-glow'

const sets = { can: new Set(['a', 'b']), act: new Set(['b', 'c']) }

describe('el brillo de una carta en un duelo', () => {
  it('celeste lo que podés hacer, ámbar lo que se activa (gana), nada lo demás', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => glowOf(id, sets))).toEqual(['can', 'act', 'act', null])
    expect(glowOf('a', {})).toBeNull()
  })

  it('una pila brilla como la carta de adentro que más dice', () => {
    expect(pileGlowOf(['d', 'a'], sets)).toBe('can')
    expect(pileGlowOf(['a', 'c', 'd'], sets)).toBe('act')
    expect(pileGlowOf(['d'], sets)).toBeNull()
    expect(pileGlowOf([], sets)).toBeNull()
  })

  it('brilla en ámbar cada eslabón mientras se encadena y se resuelve, paso a paso, de los dos lados', () => {
    const link = (index: number, side: 'mine' | 'theirs', id: string): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: { side, id }, code: 1, mine: side === 'mine' } })
    const steps: ChainStep[] = [link(0, 'mine', 'm1'), link(1, 'theirs', 't1'), { kind: 'solving', at: 0, index: 1 }, { kind: 'solved', at: 0, index: 1 }, { kind: 'solving', at: 0, index: 0 }, { kind: 'solved', at: 0, index: 0 }, { kind: 'end', at: 0, index: -1 }]
    const at = (count: number) => {
      const { mine, theirs } = actingOf(chainFeed(steps, count))

      return [...mine, ...theirs]
    }

    expect(at(1)).toEqual(['m1'])
    expect(at(2)).toEqual(['m1', 't1'])
    expect(at(3)).toEqual(['m1', 't1'])
    // CL2 se resolvió: queda sólo CL1, que todavía espera; al resolverse y terminar, nada.
    expect(at(4)).toEqual(['m1'])
    expect(at(5)).toEqual(['m1'])
    expect(at(6)).toEqual([])
    expect(at(7)).toEqual([])
    expect(actingOf(null)).toEqual({ mine: new Set(), theirs: new Set() })
  })
})
