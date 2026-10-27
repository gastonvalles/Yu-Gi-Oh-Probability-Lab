// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeHandtrapConfig } from '../app/handtraps'
import type { MatState } from '../app/practice-mat'
import { useMatSession } from '../app/use-mat-session'
import { AutoSoloScreen, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { PracticeMat } from '../components/probability/PracticeMat'
import { CARDS as AUTO_CARDS, fakeSession } from './support/auto-session-fake'
import { CARDS, INITIAL, render } from './support/practice-mat-harness'

// «Seguir en automático» de la práctica manual (el camino inverso de «Seguir en modo manual»): en el ⋯, apagado con el porqué fuera de un punto limpio, un diálogo de una línea y la
// pantalla automática que arranca desde esa mesa (`resume` de la sesión). El motor lo prueban `auto-resume*`; el ciclo manual → automático → manual, `auto-entrada`.

type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

function Practice({ initial, onAuto }: { initial: MatState; onAuto: (state: MatState) => void }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => start(initial, [], {}), [start, initial])

  return mat.session && mat.state ? <PracticeMat session={mat.session} state={mat.state} cardsById={CARDS} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => {}} onAuto={onAuto} /> : null
}

const autoRow = () => {
  if (!screen.queryByRole('menu')) fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Más opciones' }))
  return screen.getByRole('menuitem', { name: /^Seguir en automático/ })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('«Seguir en automático» en el ⋯ de la práctica', () => {
  it('fuera de un punto limpio está apagado y dice por qué: la fase, las fichas', () => {
    render(<Practice initial={INITIAL} onAuto={() => {}} />)
    expect(autoRow()).toBeDisabled()
    expect(autoRow()).toHaveTextContent('Sólo en tu Main Phase 1 o 2')
    cleanup()

    const token = { ...INITIAL, phase: 'main1' as const, mz: [{ id: 'token-1', pos: 'atk' as const, counters: 0, materials: [] }, null, null, null, null] }

    render(<Practice initial={token} onAuto={() => {}} />)
    expect(autoRow()).toBeDisabled()
    expect(autoRow()).toHaveTextContent('Sacá las fichas primero')
  })

  it('en tu Main Phase pide confirmar en una línea (Cancelar no hace nada) y sigue con la mesa de ahora', () => {
    const onAuto = vi.fn()
    const main = { ...INITIAL, phase: 'main1' as const }

    render(<Practice initial={main} onAuto={onAuto} />)
    expect(autoRow()).toBeEnabled()
    fireEvent.click(autoRow())
    let dialog = screen.getByRole('alertdialog', { name: 'Seguir en automático' })

    expect(dialog).toHaveTextContent(/turno nuevo.*equipos y contadores no pasan/)
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(expect.arrayContaining(['Cancelar', 'Seguir en automático']))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onAuto).not.toHaveBeenCalled()

    fireEvent.click(autoRow())
    dialog = screen.getByRole('alertdialog', { name: 'Seguir en automático' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir en automático' }))
    expect(onAuto).toHaveBeenCalledTimes(1)
    expect(onAuto.mock.calls[0]![0]).toMatchObject({ phase: 'main1', hand: main.hand, deck: main.deck })
  })

  it('sin `onAuto` (la beta apagada) no está', () => {
    render(<Practice initial={INITIAL} onAuto={undefined as unknown as () => void} />)
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Más opciones' }))
    expect(screen.queryByRole('menuitem', { name: /^Seguir en automático/ })).toBeNull()
  })
})

describe('la pantalla automática que sigue de la mesa manual', () => {
  const mount = (resume: NonNullable<AutoSoloScreenProps['resume']>) => {
    const calls: Options[] = []

    render(
      <AutoSoloScreen
        mainIds={[...AUTO_CARDS.keys()].filter((id) => id !== 'card-500-1')}
        extraIds={['card-500-1']}
        cardsById={AUTO_CARDS}
        deckName="Test"
        onExit={() => {}}
        resume={resume}
        connect={(_deck, options) => {
          calls.push(options)
          return fakeSession()
        }}
      />,
    )

    return calls
  }

  it('la sesión recibe la mesa, las vidas, el código de cada copia y, con handtraps, la mano que tenía el rival (sin las usadas); «Nueva mano» suelta la mesa', () => {
    writeHandtrapConfig({ enabled: true, picks: [{ id: 14558127, name: 'Ash Blossom & Joyous Spring', copies: 3 }, { id: 23434538, name: 'Maxx "C"', copies: 2 }], hand: 3 })
    const state = { ...INITIAL, phase: 'main2' as const, rival: { hand: ['rival.card-14558127-1', 'rival.card-23434538-1', 'rival.card-14558127-2'], used: ['rival.card-14558127-2'] } }
    const calls = mount({ state, lp: [8000, 8000] })
    const resume = calls[0]!.resume!

    expect(resume.mine).toBe(state)
    expect(resume.lp).toEqual([8000, 8000])
    expect(resume.codeOf('mine', 'card-14558127-2')).toBe(14558127)
    expect(resume.rivalHand).toEqual([14558127, 23434538])

    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Más opciones' }))
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: /^Nueva mano/ })))
    expect(calls.at(-1)!.resume).toBeUndefined()
  })
})
