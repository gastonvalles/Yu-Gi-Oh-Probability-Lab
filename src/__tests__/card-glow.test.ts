import { describe, expect, it } from 'vitest'
import { chainFeed, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION } from '../app/auto/protocol'
import { FROM_HAND, actingOf, fieldLinkOf, glowOf, handLinksOf, linksOf, pileGlowOf, pileLinksOf } from '../app/card-glow'
import { glowFrame } from '../components/probability/practice-styles'

const sets = { can: new Set(['a', 'b']), act: new Set(['b', 'c']) }

describe('el brillo de una carta en un duelo', () => {
  it('celeste lo que podés hacer, ámbar lo que se activa (gana), nada lo demás', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => glowOf(id, sets))).toEqual(['can', 'act', 'act', null])
    expect(glowOf('a', {})).toBeNull()
  })

  it('el tuyo que ataca mientras elegís a quién va en rojo (le gana a «podés»; lo que se activa le gana a él)', () => {
    expect(['a', 'b', 'd'].map((id) => glowOf(id, { ...sets, aim: id }))).toEqual(['aim', 'act', 'aim'])
    expect(glowOf('a', { ...sets, aim: 'z' })).toBe('can')
  })

  it('el marco de adentro: celeste quieto y ámbar con la luz que gira, finos sólo en el duelo (los del Lab no cambian)', () => {
    expect((['can', 'act', 'aim', 'opening', 'problem'] as const).map(glowFrame)).toEqual([
      { tone: 'playable', orbit: false, fine: true },
      { tone: 'gold', orbit: true, fine: true },
      { tone: 'red', orbit: false, fine: true },
      { tone: 'green', orbit: false, fine: false },
      { tone: 'red', orbit: false, fine: false },
    ])
    expect(glowFrame(null)).toBeNull()
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

describe('los medallones del eslabón', () => {
  const link = (index: number, side: 'mine' | 'theirs', id: string, mine = side === 'mine', from?: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: { side, id }, code: 1, mine, ...(from === undefined ? {} : { from }) } })

  it('cada carta de la cadena lleva su número, del lado donde está y con el color de quien la activó; el que se resuelve late y se van del último al primero', () => {
    const steps: ChainStep[] = [link(0, 'mine', 'm1'), link(1, 'theirs', 't1', false, FROM_HAND), link(2, 'mine', 't2', false), { kind: 'solving', at: 0, index: 2 }, { kind: 'solved', at: 0, index: 2 }, { kind: 'solving', at: 0, index: 1 }]
    const at = (count: number) => linksOf(chainFeed(steps, count))

    expect(Object.fromEntries(at(3).mine)).toEqual({ m1: { numbers: [1], mine: true, fromHand: false }, t2: { numbers: [3], mine: false, fromHand: false } })
    expect(Object.fromEntries(at(3).theirs)).toEqual({ t1: { numbers: [2], mine: false, fromHand: true } })
    // Resolviendo el 3: el suyo late.
    expect(at(5).mine.get('t2')).toEqual({ numbers: [3], mine: false, fromHand: false, resolving: 3 })
    // Empieza el 2: el 3 ya se fue.
    expect(Object.fromEntries(at(6).mine)).toEqual({ m1: { numbers: [1], mine: true, fromHand: false } })
    expect(at(6).theirs.get('t1')?.resolving).toBe(2)
    // Terminada, ninguno.
    expect(linksOf(chainFeed([...steps, { kind: 'end', at: 0, index: -1 }], 7))).toEqual({ mine: new Map(), theirs: new Map() })
    expect(linksOf(null)).toEqual({ mine: new Map(), theirs: new Map() })
  })

  it('lo activado desde la mano va sobre la mano, no sobre la pila ni la casilla adonde se fue (un costo); si sigue en la mano, sobre su carta', () => {
    const { mine } = linksOf(chainFeed([link(0, 'mine', 'f'), link(1, 'mine', 'h1', true, FROM_HAND), link(2, 'mine', 'h2', true, FROM_HAND)], 3))

    expect(fieldLinkOf(mine, 'f')?.numbers).toEqual([1])
    expect(fieldLinkOf(mine, 'h1')).toBeNull()
    expect(pileLinksOf(['h1', 'f'], mine)?.numbers).toEqual([1])
    // h1 se descartó (ya no está en la mano) y h2 sigue: sólo h1 va sobre la mano.
    expect(handLinksOf(mine, ['h2', 'x'])).toEqual({ numbers: [2], mine: true, fromHand: true })
    expect(handLinksOf(mine, ['h1', 'h2'])).toBeNull()
  })

  it('una carta con dos eslabones los lleva los dos; una pila junta los de adentro, en orden', () => {
    const { mine } = linksOf(chainFeed([link(0, 'mine', 'a'), link(1, 'mine', 'b'), link(2, 'mine', 'a')], 3))

    expect(mine.get('a')?.numbers).toEqual([1, 3])
    expect(pileLinksOf(['b', 'x', 'a'], mine)).toEqual({ numbers: [1, 2, 3], mine: true, fromHand: false })
    expect(pileLinksOf(['x'], mine)).toBeNull()
    expect(pileLinksOf(['a'], undefined)).toBeNull()
  })

  it('negada o sin efecto: la insignia lo lleva, con quién (si se sabe); la pila también', () => {
    const steps: ChainStep[] = [link(0, 'mine', 'a'), link(1, 'theirs', 't'), { kind: 'solving', at: 0, index: 1 }, { kind: 'disabled', at: 0, index: 0, by: 2 }]
    const { mine, theirs } = linksOf(chainFeed(steps, steps.length))

    expect(mine.get('a')).toEqual({ numbers: [1], mine: true, fromHand: false, voided: { state: 'disabled', by: 2 } })
    expect(theirs.get('t')).not.toHaveProperty('voided')
    expect(pileLinksOf(['x', 'a'], mine)?.voided).toEqual({ state: 'disabled', by: 2 })
    expect(linksOf(chainFeed([link(0, 'mine', 'a'), { kind: 'negated', at: 0, index: 0 }], 2)).mine.get('a')?.voided).toEqual({ state: 'negated' })
  })

  it('«desde la mano» es la mano del núcleo', () => expect(FROM_HAND).toBe(LOCATION.HAND))
})
