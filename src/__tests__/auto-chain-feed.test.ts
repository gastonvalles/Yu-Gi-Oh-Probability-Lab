import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, chainDwell, chainFeed, stepsUpTo, type ChainStep } from '../app/auto/chain-feed'

const link = (index: number, mine: boolean, code: number, at: number): ChainStep => ({ kind: 'chain', at, index, link: { card: { side: mine ? 'mine' : 'theirs', id: `x${code}` }, code, mine } })
const step = (kind: ChainStep['kind'], index: number, at: number): ChainStep => ({ kind, at, index })

// Tu Terraforming (CL1) y el Ash del rival (CL2), en el orden del núcleo: Ash se resuelve primero y, mientras, deja Terraforming sin efecto.
const ASH_CHAIN: ChainStep[] = [
  link(0, true, 73628505, 1),
  link(1, false, 14558127, 1),
  step('solving', 1, 1),
  step('disabled', 0, 1),
  step('solved', 1, 1),
  step('solving', 0, 1),
  step('solved', 0, 2),
  step('end', -1, 2),
]

describe('chainFeed: la cadena paso a paso', () => {
  it('se arma de a un eslabón y se resuelve del último al primero; lo que quedó sin efecto sigue así al terminar', () => {
    expect(chainFeed(ASH_CHAIN, 0)).toBeNull()
    expect(chainFeed(ASH_CHAIN, 1)).toMatchObject({ key: 0, resolving: false, done: false, focus: 0, rows: [{ number: 1, mine: true, state: 'chained' }] })
    expect(chainFeed(ASH_CHAIN, 2)).toMatchObject({ resolving: false, focus: 1, rows: [{ state: 'chained' }, { number: 2, mine: false, code: 14558127, state: 'chained' }] })
    expect(chainFeed(ASH_CHAIN, 3)).toMatchObject({ resolving: true, focus: 1, rows: [{ state: 'chained' }, { state: 'solving' }] })
    expect(chainFeed(ASH_CHAIN, 4)).toMatchObject({ focus: 0, rows: [{ state: 'disabled' }, { state: 'solving' }] })
    // Le llega el turno y se resuelve: sigue sin efecto.
    expect(chainFeed(ASH_CHAIN, 6)).toMatchObject({ focus: 0, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    expect(chainFeed(ASH_CHAIN, 7)).toMatchObject({ done: false, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    expect(chainFeed(ASH_CHAIN, 8)).toMatchObject({ done: true, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    // Los primeros en resolverse son los últimos que se sumaron.
    expect(ASH_CHAIN.filter((item) => item.kind === 'solving').map((item) => item.index)).toEqual([1, 0])
  })

  it('una cadena nueva reemplaza a la anterior (otra key)', () => {
    const next = [...ASH_CHAIN, link(0, false, 1, 3), step('solving', 0, 3)]

    expect(chainFeed(next, next.length)).toMatchObject({ key: ASH_CHAIN.length, resolving: true, rows: [{ number: 1, mine: false, state: 'solving' }] })
  })

  it('el ritmo: un eslabón se ve un rato y cada uno se lee al resolverse; una activación suelta, breve', () => {
    expect(ASH_CHAIN.map((_, i) => chainDwell(ASH_CHAIN, i))).toEqual([CHAIN_LINK_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, CHAIN_SOLVE_MS, 0, 0, 0, 0])
    const single = [link(0, true, 5, 0), step('solving', 0, 0), step('solved', 0, 1), step('end', -1, 1)]

    expect(single.map((_, i) => chainDwell(single, i))).toEqual([0, CHAIN_LINK_MS, 0, 0])
    expect(chainDwell(single, -1)).toBe(0)
  })

  it('stepsUpTo: los que llegaron hasta esa jugada de tu mesa', () => {
    expect(stepsUpTo(ASH_CHAIN, 0)).toBe(0)
    expect(stepsUpTo(ASH_CHAIN, 1)).toBe(6)
    expect(stepsUpTo(ASH_CHAIN, 2)).toBe(8)
  })
})
