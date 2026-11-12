import { describe, expect, it } from 'vitest'
import { chainFeed, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION } from '../app/auto/protocol'
import { FROM_HAND, MEDAL_PILES, actingOf, glowOf, linksOf, medalPlaceOf, medalsOf, pileGlowOf, pileLinksOf, type ChainMedal } from '../app/card-glow'
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

describe('los eslabones de cada carta (su nombre y el gris de la negada)', () => {
  const link = (index: number, side: 'mine' | 'theirs', id: string, mine = side === 'mine', from?: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: { side, id }, code: 1, mine, ...(from === undefined ? {} : { from }) } })

  it('cada carta de la cadena lleva su número, del lado donde está y con el color de quien la activó; se van del último al primero', () => {
    const steps: ChainStep[] = [link(0, 'mine', 'm1'), link(1, 'theirs', 't1', false, FROM_HAND), link(2, 'mine', 't2', false), { kind: 'solving', at: 0, index: 2 }, { kind: 'solved', at: 0, index: 2 }, { kind: 'solving', at: 0, index: 1 }]
    const at = (count: number) => linksOf(chainFeed(steps, count))

    expect(Object.fromEntries(at(3).mine)).toEqual({ m1: { numbers: [1], mine: true, fromHand: false }, t2: { numbers: [3], mine: false, fromHand: false } })
    expect(Object.fromEntries(at(3).theirs)).toEqual({ t1: { numbers: [2], mine: false, fromHand: true } })
    expect(Object.fromEntries(at(6).mine)).toEqual({ m1: { numbers: [1], mine: true, fromHand: false } })
    expect(linksOf(chainFeed([...steps, { kind: 'end', at: 0, index: -1 }], 7))).toEqual({ mine: new Map(), theirs: new Map() })
    expect(linksOf(null)).toEqual({ mine: new Map(), theirs: new Map() })
  })

  it('una carta con dos eslabones los lleva los dos; una pila junta los de adentro, en orden', () => {
    const { mine } = linksOf(chainFeed([link(0, 'mine', 'a'), link(1, 'mine', 'b'), link(2, 'mine', 'a')], 3))

    expect(mine.get('a')?.numbers).toEqual([1, 3])
    expect(pileLinksOf(['b', 'x', 'a'], mine)).toEqual({ numbers: [1, 2, 3], mine: true, fromHand: false })
    expect(pileLinksOf(['x'], mine)).toBeNull()
    expect(pileLinksOf(['a'], undefined)).toBeNull()
  })

  it('negada o sin efecto: lo lleva, con quién (si se sabe); la pila también', () => {
    const steps: ChainStep[] = [link(0, 'mine', 'a'), link(1, 'theirs', 't'), { kind: 'solving', at: 0, index: 1 }, { kind: 'disabled', at: 0, index: 0, by: 2 }]
    const { mine, theirs } = linksOf(chainFeed(steps, steps.length))

    expect(mine.get('a')).toEqual({ numbers: [1], mine: true, fromHand: false, voided: { state: 'disabled', by: 2 } })
    expect(theirs.get('t')).not.toHaveProperty('voided')
    expect(pileLinksOf(['x', 'a'], mine)?.voided).toEqual({ state: 'disabled', by: 2 })
    expect(linksOf(chainFeed([link(0, 'mine', 'a'), { kind: 'negated', at: 0, index: 0 }], 2)).mine.get('a')?.voided).toEqual({ state: 'negated' })
  })

  it('«desde la mano» es la mano del núcleo', () => expect(FROM_HAND).toBe(LOCATION.HAND))
})

describe('los medallones de la cadena (al resolver, donde se activó)', () => {
  const at = (index: number, side: 'mine' | 'theirs', location: number, sequence = 0, id = `c${index}`): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: { side, id }, code: 1, mine: side === 'mine', from: location, place: { side, location, sequence } } })
  const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
  const plain = (medals: Map<string, ChainMedal[]>) => Object.fromEntries([...medals].map(([place, list]) => [place, list.map((m) => `${m.number}${m.resolving ? '*' : ''}${m.voided ? 'x' : ''}`).join(' ')]))
  // Foolish Burial tuya en tu Mágica 2, Ash del rival desde su mano y tu Called by the Grave en la Mágica 1; después, un efecto en tu Cementerio.
  const steps: ChainStep[] = [at(0, 'mine', LOCATION.SZONE, 2), at(1, 'theirs', LOCATION.HAND), at(2, 'mine', LOCATION.SZONE, 1), at(3, 'mine', LOCATION.GRAVE)]

  it('armando, ninguno (lo dice la escena); resolviendo, cada uno en su lugar, del último al primero: el que se resuelve late; terminada, ninguno', () => {
    const run = [...steps, step('solving', 3), step('solved', 3), step('solving', 2), step('disabled', 1), step('solved', 2), step('solving', 1), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)]
    const medals = (count: number) => medalsOf(chainFeed(run, count))

    expect(plain(medals(4).mine)).toEqual({})
    expect(plain(medals(6).mine)).toEqual({ 'st:2': '1', 'st:1': '3', gy: '4*' })
    expect(plain(medals(6).theirs)).toEqual({ hand: '2' })
    // Resolviendo el 3 (Called deja a Ash sin efecto): el 4 se fue y sólo el 2 va tachado.
    expect(plain(medals(9).mine)).toEqual({ 'st:2': '1', 'st:1': '3*' })
    expect(plain(medals(9).theirs)).toEqual({ hand: '2x' })
    expect(plain(medals(run.length).mine)).toEqual({})
    expect(medalsOf(null)).toEqual({ mine: new Map(), theirs: new Map() })
  })

  it('se quedan donde se activó, aunque la carta después se mueva (es el lugar, no la carta); varios en un mismo lugar, en orden y sólo el negado tachado', () => {
    const run = [at(0, 'mine', LOCATION.GRAVE, 0, 'a'), at(1, 'mine', LOCATION.GRAVE, 0, 'b'), step('solving', 1), step('negated', 0)]

    expect(plain(medalsOf(chainFeed(run, run.length)).mine)).toEqual({ gy: '1x 2*' })
  })

  it('el lugar de cada eslabón: casillas, Zona de Campo, escalas, materiales y pilas', () => {
    expect([medalPlaceOf(LOCATION.MZONE, 3), medalPlaceOf(LOCATION.MZONE, 6), medalPlaceOf(LOCATION.MZONE | LOCATION.OVERLAY, 2)]).toEqual(['mz:3', 'emz:1', 'mz:2'])
    expect([medalPlaceOf(LOCATION.SZONE, 4), medalPlaceOf(LOCATION.SZONE, 5), medalPlaceOf(LOCATION.SZONE, 6), medalPlaceOf(LOCATION.SZONE, 7)]).toEqual(['st:4', 'field', 'st:0', 'st:4'])
    expect([LOCATION.DECK, LOCATION.HAND, LOCATION.GRAVE, LOCATION.REMOVED, LOCATION.EXTRA].map((location) => medalPlaceOf(location, 0))).toEqual(['deck', 'hand', 'gy', 'banished', 'extra'])
    expect(MEDAL_PILES).toEqual({ [LOCATION.DECK]: 'deck', [LOCATION.HAND]: 'hand', [LOCATION.GRAVE]: 'gy', [LOCATION.REMOVED]: 'banished', [LOCATION.EXTRA]: 'extra' })
  })
})
