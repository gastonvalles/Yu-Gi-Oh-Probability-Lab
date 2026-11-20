// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import type { SessionAnswer } from '../app/auto/auto-session'
import { AutoSoloScreen, type AutoSoloScreenProps, type KeptDuel } from '../components/auto/AutoSoloScreen'
import { core } from './support/auto-screen-harness'
import { CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { render } from './support/practice-mat-harness'

// Salir de la mesa automática a otro paso y volver (Atrás o el menú) retoma la partida (`keep`): la misma semilla, el mismo asiento y las respuestas, que el núcleo re-simula
// (`restore`: la misma mano, el mismo campo, la misma fase y el mismo Deshacer; que la re-simulación da la misma mesa lo prueba `auto-session.test.ts`). Otro deck, otra partida.

type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

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

  it('con otro deck (cambiarlo o editarlo) empieza otra partida', () => {
    const keep: { current: KeptDuel | null } = { current: null }
    const first = mount(keep)

    core(() => first.sessions[0]!.set({ status: 'ready', seed: 99, answers: PLAYED }))
    first.view.unmount()

    const other = mount(keep, MAIN.slice(1))

    expect(other.options[0]?.restore).toBeUndefined()
  })
})
