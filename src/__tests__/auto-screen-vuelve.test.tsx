// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { SessionAnswer } from '../app/auto/auto-session'
import type { MatAction } from '../app/practice-mat'
import { playSfx } from '../app/sfx'
import { AutoSoloScreen, type AutoSoloScreenProps, type KeptDuel } from '../components/auto/AutoSoloScreen'
import { core } from './support/auto-screen-harness'
import { CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { render } from './support/practice-mat-harness'

// Salir de la mesa automática a otro paso y volver (Atrás o el menú) retoma la partida (`keep`): la misma semilla, el mismo asiento y las respuestas, que el núcleo re-simula
// (`restore`: la misma mano, el mismo campo, la misma fase y el mismo Deshacer; que la re-simulación da la misma mesa lo prueba `auto-session.test.ts`). Otro deck, otra partida.

// Lo que suena (el barajado y el reparto de la mano, las vidas): al volver, nada.
vi.mock('../app/sfx', async (original) => ({ ...(await original<typeof import('../app/sfx')>()), playSfx: vi.fn() }))

type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

const MAIN1: MatAction = { type: 'phase', phase: 'main1' }

const MAIN = [...CARDS.keys()].filter((id) => id !== 'card-500-1')
const EXTRA = ['card-500-1']
const PLAYED: SessionAnswer[] = [
  { seat: 0, answer: { type: 'select_idlecmd', action: 0, index: 0 } },
  { seat: 0, answer: { type: 'select_idlecmd', action: 6, index: null } },
]

function mount(keep: { current: KeptDuel | null }, mainIds = MAIN) {
  const sessions: FakeSession[] = []
  const options: Options[] = []
  const connect: AutoSoloScreenProps['connect'] = (_, given) => {
    const fake = fakeSession()

    // Como la de verdad: arranca cargando, con la semilla que se le pidió.
    fake.set({ status: 'loading', seed: given.seed ?? 1 })
    sessions.push(fake)
    options.push(given)
    return fake
  }
  const view = render(<AutoSoloScreen mainIds={mainIds} extraIds={EXTRA} cardsById={CARDS} deckName="Test" onExit={() => {}} keep={keep} connect={connect} />)

  return { view, sessions, options }
}

describe('auto-screen · salir de la mesa y volver', () => {
  it('vuelve a la misma partida: la semilla, el asiento y las respuestas de antes de salir', () => {
    const keep: { current: KeptDuel | null } = { current: null }
    const first = mount(keep)

    expect(first.options[0]?.restore).toBeUndefined()
    core(() => first.sessions[0]!.set({ status: 'ready', seed: 4242, answers: PLAYED }))
    first.view.unmount()
    expect(first.sessions[0]!.destroyed).toBe(true)

    const back = mount(keep)

    expect(back.options).toHaveLength(1)
    expect(back.options[0]).toMatchObject({ seed: 4242, seat: 0, restore: { answers: PLAYED } })
  })

  it('salir mientras re-simula guarda lo que re-simulaba; salir después, lo que se jugó desde entonces', () => {
    const keep: { current: KeptDuel | null } = { current: null }
    const first = mount(keep)

    core(() => first.sessions[0]!.set({ status: 'ready', seed: 7, answers: PLAYED }))
    first.view.unmount()
    // Todavía cargando (la sesión no contó nada): al salir, vale la partida de antes.
    mount(keep).view.unmount()
    expect(keep.current).toMatchObject({ seed: 7, answers: PLAYED })

    const back = mount(keep)

    expect(back.options[0]).toMatchObject({ seed: 7, restore: { answers: PLAYED } })
    core(() => back.sessions[0]!.set({ status: 'ready', answers: [...PLAYED, PLAYED[0]!] }))
    back.view.unmount()
    expect(keep.current?.answers).toHaveLength(3)
  })

  it('volver entra quieta y callada: la mesa aparece al terminar de re-simular, sin reparto, sin aviso de vidas y sin reabrir lo que te mostró un efecto', () => {
    const keep: { current: KeptDuel | null } = { current: null }
    const first = mount(keep)

    core(() => first.sessions[0]!.set({ status: 'ready', answers: PLAYED }))
    first.view.unmount()
    vi.mocked(playSfx).mockClear()

    const fake = mount(keep).sessions[0]!
    const table = () => screen.queryByRole('region', { name: 'Mesa de práctica' })

    // Mientras re-simula, la portada de carga y nada de la mesa.
    expect(table()).toBeNull()
    core(() => fake.set({ replaying: true }))
    expect(table()).toBeNull()
    // Terminó: tu fase, una jugada del rival que te mostró una carta y las vidas que ya habías perdido.
    const { overlay } = fake.getSnapshot()

    core(() => fake.set({ status: 'ready', replaying: false, mineActions: [MAIN1], order: ['mine', 'theirs'], theirsActs: [{ action: MAIN1, reveal: {}, seen: { ids: ['c1'], codes: [700], by: 0 } }], overlay: { ...overlay, lp: [7900, 8000] } }))
    expect(table()).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Puntos de vida de Vos: 7900' })).toBeInTheDocument()
    expect(document.querySelector('[data-life-delta]')).toBeNull()
    expect(screen.queryByText(/reveladas/i)).toBeNull()
    expect(vi.mocked(playSfx).mock.calls.map(([kind]) => kind)).toEqual([])

    // «Nueva mano» después (otra mesa de arranque): se baraja y se reparte como siempre.
    const { initial } = fake.getSnapshot()

    core(() => fake.set({ initial: { ...initial, mine: { ...initial.mine, deck: [...initial.mine.deck].reverse() } }, mineActions: [], order: [], theirsActs: [] }))
    expect(vi.mocked(playSfx)).toHaveBeenCalledWith('shuffle')
  })

  it('con otro deck (cambiarlo o editarlo) empieza otra partida', () => {
    const keep: { current: KeptDuel | null } = { current: null }
    const first = mount(keep)

    core(() => first.sessions[0]!.set({ status: 'ready', seed: 99, answers: PLAYED }))
    first.view.unmount()

    const other = mount(keep, MAIN.slice(1))

    expect(other.options[0]?.restore).toBeUndefined()
  })
})
