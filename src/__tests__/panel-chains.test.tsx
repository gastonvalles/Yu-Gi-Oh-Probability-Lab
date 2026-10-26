// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import type { ChainStep } from '../app/auto/chain-feed'
import { createMatState, type MatAction } from '../app/practice-mat'
import { panelChainsOf } from '../components/auto/step-chains'
import { panelStepsOf, type PanelChains } from '../components/probability/panel-steps'
import { PracticeMatPanel } from '../components/probability/PracticeMatPanel'
import { render } from './support/practice-mat-harness'

/**
 * Las cadenas en la lista de pasos de «Jugar solo automático»: la marca «Cadena N · CLn» en tu activación, cómo resolvió y el renglón de cierre. Los pasos de la cadena son los
 * que anota el adaptador (`ChainStep`, el orden de `auto-chain-feed.slow.test.ts`); la jugada `i` de tu mesa es el paso `i + 1 - skip` (la mano de apertura plegada, `skip` 1).
 */

const mine = (id: string, code = 1) => ({ card: { side: 'mine' as const, id }, code, mine: true })
const theirs = (id: string, code = 2) => ({ card: { side: 'theirs' as const, id }, code, mine: false })
const nameOf = (link: { code: number; mine: boolean }) => (link.mine ? `Mía ${link.code}` : `Suya ${link.code}`)
const DRAW: MatAction = { type: 'draw', count: 5 }

describe('panelChainsOf', () => {
  it('sin cadenas no marca nada', () => {
    expect(panelChainsOf([], 0, [DRAW], 1, nameOf)).toEqual({ marks: new Map(), ends: new Map() })
  })

  it('un eslabón tuyo: la marca va en el paso de la activación y, resuelto, dice en qué pasos; sin renglón de cierre (lo dice la marca)', () => {
    const actions: MatAction[] = [DRAW, { type: 'activate', id: 'a' }, { type: 'move', id: 'x', to: 'hand' }, { type: 'move', id: 'y', to: 'gy' }]
    const steps: ChainStep[] = [
      { kind: 'chain', at: 2, index: 0, link: mine('a') },
      { kind: 'solving', at: 2, index: 0 },
      { kind: 'solved', at: 4, index: 0 },
      { kind: 'end', at: 4, index: -1 },
    ]
    const chains = panelChainsOf(steps, steps.length, actions, 1, nameOf)

    expect([...chains.marks]).toEqual([[1, { chain: 1, link: 1, result: { negated: false, from: 2, to: 3 } }]])
    expect(chains.ends.size).toBe(0)
    // Lo que el aviso todavía no mostró no se adelanta: sin `solved`, la marca no dice cómo resolvió.
    expect(panelChainsOf(steps, 2, actions, 1, nameOf).marks.get(1)?.result).toBeNull()
  })

  it('Terraforming respondida por Ash (el orden del núcleo): la Mágica que se abre no emite «Activar» y la marca va en la jugada que la puso boca arriba; sin efecto, y el cierre con los dos eslabones después del último paso', () => {
    const actions: MatAction[] = [DRAW, { type: 'place', id: 't', zone: 'st', index: 2, pos: 'atk' }, { type: 'move', id: 't', to: 'gy' }]
    const steps: ChainStep[] = [
      { kind: 'chain', at: 2, index: 0, link: mine('t', 73628505) },
      { kind: 'chain', at: 2, index: 1, link: theirs('f.9', 14558127) },
      { kind: 'solving', at: 2, index: 1 },
      { kind: 'disabled', at: 2, index: 0 },
      { kind: 'solved', at: 2, index: 1 },
      { kind: 'solving', at: 2, index: 0 },
      { kind: 'solved', at: 3, index: 0 },
      { kind: 'end', at: 3, index: -1 },
    ]
    const chains = panelChainsOf(steps, steps.length, actions, 1, nameOf)

    expect([...chains.marks]).toEqual([[1, { chain: 1, link: 1, result: { negated: true } }]])
    expect([...chains.ends]).toEqual([
      [2, [{ chain: 1, links: [{ number: 1, name: 'Mía 73628505', state: 'disabled' }, { number: 2, name: 'Suya 14558127', state: 'solved' }] }]],
    ])
    // Con quién la negó (`by`, del adaptador), la marca y el cierre lo llevan.
    const withBy = panelChainsOf(steps.map((step) => (step.kind === 'disabled' ? { ...step, by: 2 } : step)), steps.length, actions, 1, nameOf)

    expect(withBy.marks.get(1)?.result).toEqual({ negated: true, by: 2 })
    expect(withBy.ends.get(2)?.[0]?.links[0]).toEqual({ number: 1, name: 'Mía 73628505', state: 'disabled', by: 2 })
  })

  it('el costo (como Pot of Desires con el núcleo): las cartas que se mueven entre el eslabón y el paso siguiente; la mira de un objetivo no es costo y la resolución tampoco', () => {
    const actions: MatAction[] = [
      DRAW,
      { type: 'place', id: 's', zone: 'st', index: 0, pos: 'atk' },
      { type: 'move', id: 'c1', to: 'banished', faceDown: true },
      { type: 'target', id: 'm' },
      { type: 'move', id: 'c2', to: 'banished', faceDown: true },
      { type: 'draw', count: 2 },
    ]
    const steps: ChainStep[] = [
      { kind: 'chain', at: 2, index: 0, link: mine('s') },
      { kind: 'solving', at: 5, index: 0 },
      { kind: 'solved', at: 6, index: 0 },
      { kind: 'end', at: 6, index: -1 },
    ]
    const chains = panelChainsOf(steps, steps.length, actions, 1, nameOf)

    expect([...chains.marks]).toEqual([
      [1, { chain: 1, link: 1, result: { negated: false, from: 5, to: 5 } }],
      [2, { chain: 1, link: 1, cost: true, result: null }],
      [4, { chain: 1, link: 1, cost: true, result: null }],
    ])
    // Sin el paso siguiente todavía no se sabe dónde termina el costo: nada.
    expect([...panelChainsOf(steps, 1, actions, 1, nameOf).marks.keys()]).toEqual([1])
  })

  it('sin una jugada de la carta desde el paso anterior de la cadena (o antes de la mano de apertura), no hay marca: nunca en un paso equivocado', () => {
    const actions: MatAction[] = [DRAW, { type: 'activate', id: 'a' }, { type: 'move', id: 'z', to: 'gy' }]
    const steps: ChainStep[] = [
      { kind: 'chain', at: 2, index: 0, link: mine('a') },
      { kind: 'solving', at: 2, index: 0 },
      { kind: 'solved', at: 3, index: 0 },
      { kind: 'end', at: 3, index: -1 },
      // Otra cadena de la misma carta, pero su jugada quedó antes del paso anterior: se cae.
      { kind: 'chain', at: 3, index: 0, link: mine('a') },
    ]
    const chains = panelChainsOf(steps, steps.length, actions, 1, nameOf)

    expect([...chains.marks.keys()]).toEqual([1])
    expect(panelChainsOf([{ kind: 'chain', at: 1, index: 0, link: mine('draw') }], 1, [{ type: 'activate', id: 'draw' }], 1, nameOf).marks.size).toBe(0)
  })

  it('una cadena sólo del rival va al cierre, después del paso en que llegó (0 = después de la mano inicial); las cadenas se numeran en orden', () => {
    const actions: MatAction[] = [DRAW, { type: 'activate', id: 'a' }]
    const steps: ChainStep[] = [
      { kind: 'chain', at: 1, index: 0, link: theirs('f.1') },
      { kind: 'solving', at: 1, index: 0 },
      { kind: 'solved', at: 1, index: 0 },
      { kind: 'end', at: 1, index: -1 },
      { kind: 'chain', at: 2, index: 0, link: mine('a') },
      { kind: 'chain', at: 2, index: 1, link: theirs('f.2') },
      { kind: 'solving', at: 2, index: 1 },
      { kind: 'negated', at: 2, index: 0 },
    ]
    const chains = panelChainsOf(steps, steps.length, actions, 1, nameOf)

    expect([...chains.ends]).toEqual([[0, [{ chain: 1, links: [{ number: 1, name: 'Suya 2', state: 'solved' }] }]]])
    // La segunda todavía no terminó: su marca ya dice «sin efecto» (negada), su cierre todavía no.
    expect([...chains.marks]).toEqual([[1, { chain: 2, link: 1, result: { negated: true } }]])
  })
})

describe('la lista de pasos con cadenas', () => {
  const initial = createMatState(['card-1-1', 'card-2-1'], [], 2)
  const actions: MatAction[] = [{ type: 'activate', id: 'card-1-1' }, { type: 'move', id: 'card-2-1', to: 'gy' }]
  const steps = panelStepsOf(initial, actions, ['Activás Uno', 'Dos va al cementerio'], (id) => id, () => null)
  const chains: PanelChains = {
    marks: new Map([[1, { chain: 1, link: 1, result: { negated: true } }]]),
    ends: new Map([[2, [{ chain: 1, links: [{ number: 1, name: 'Uno', state: 'disabled' }, { number: 2, name: 'Ash (Rival)', state: 'solved' }] }]]]),
  }
  const panel = (extra: { chains?: PanelChains }) => (
    <PracticeMatPanel steps={steps} initial={initial} cursor={2} onSeek={() => {}} nameOf={(id) => id} artOf={() => null} combos={[]} deckName="" onLoad={() => {}} onRename={() => {}} onDelete={() => {}} showCombos={false} {...extra} />
  )
  const buttons = () => screen.getAllByRole('button').map((button) => button.textContent)

  it('la marca va con los chips de la activación y cómo resolvió al pie, como descripción del botón (su nombre no cambia); el cierre va arriba de su último paso y no es un botón', () => {
    const { unmount } = render(panel({}))
    const before = buttons()

    unmount()
    render(panel({ chains }))

    expect(buttons()).toEqual(before)
    const activation = screen.getByRole('button', { name: /Activás Uno/ })

    expect(activation).toHaveAccessibleDescription(/Cadena 1 · CL1/)
    expect(activation).toHaveAccessibleDescription(/Resuelve: sin efecto/)
    expect(screen.getByText('Resuelve: sin efecto')).toHaveClass('bg-danger', 'text-white')

    const items = within(screen.getByRole('list', { name: 'Jugadas' })).getAllByRole('listitem')
    const end = items.find((item) => item.dataset.chainEnd === '1')!

    // Al revés, como el registro: el cierre, el paso 2, el paso 1 y la mano inicial.
    expect(items.indexOf(end)).toBe(0)
    expect(end).toHaveTextContent('Cadena 1 resuelta')
    expect(end).toHaveTextContent('CL1 Uno: Sin efecto · CL2 Ash (Rival): Resuelta')
    expect(within(end).queryByRole('button')).toBeNull()
  })

  it('negada con quién (`by`): «Resuelve: sin efecto · por CL2» al pie y «por CL2» en el cierre', () => {
    render(
      panel({
        chains: {
          marks: new Map([[1, { chain: 1, link: 1, result: { negated: true, by: 2 } }]]),
          ends: new Map([[2, [{ chain: 1, links: [{ number: 1, name: 'Uno', state: 'disabled', by: 2 }, { number: 2, name: 'Ash (Rival)', state: 'solved' }] }]]]),
        },
      }),
    )

    expect(screen.getByText('Resuelve: sin efecto · por CL2')).toHaveClass('bg-danger', 'text-white')
    expect(screen.getByText('CL1 Uno: Sin efecto por CL2 · CL2 Ash (Rival): Resuelta')).toBeInTheDocument()
  })

  it('en la lista compacta (sin detalles) no hay chips ni marca; el cierre queda', () => {
    localStorage.setItem('ygo-lab:steps-details', 'off')
    render(panel({ chains }))

    expect(screen.queryByText('Cadena 1 · CL1')).toBeNull()
    expect(screen.queryByText('Resuelve: sin efecto')).toBeNull()
    expect(screen.getByText('Cadena 1 resuelta')).toBeInTheDocument()
    localStorage.clear()
  })
})
