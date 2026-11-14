// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDuelReplay } from '../app/duel-replay'
import { impactOn, sacrificeAt } from '../app/field-impact'
import { createMatState } from '../app/practice-mat'
import { entranceAllowed, playEntrance, playPendulum } from '../app/summon-entrance'
import type { Strike } from '../components/probability/AttackFx'
import { landingDelay } from '../components/probability/MatFx'
import { DuelReplayScreen } from '../components/replays/DuelReplayScreen'
import { ReplayLayer } from '../components/replays/ReplayLayer'

// El impacto de verdad dibuja por el DOM y la Web Animations API (jsdom no la tiene): acá se mira qué decide el replay y con qué lo llama.
vi.mock('../app/field-impact', async (original) => ({ ...(await original<typeof import('../app/field-impact')>()), impactOn: vi.fn(), sacrificeAt: vi.fn() }))
vi.mock('../app/summon-entrance', async (original) => ({ ...(await original<typeof import('../app/summon-entrance')>()), entranceAllowed: vi.fn(() => false), playEntrance: vi.fn(() => null), playPendulum: vi.fn(() => null) }))
vi.mock('../components/probability/AttackFx', async (original) => ({
  ...(await original<typeof import('../components/probability/AttackFx')>()),
  AttackFx: ({ strike }: { strike: Strike }) => <div data-testid="strike" data-from={strike.attacker.getAttribute('data-card-id') ?? ''} data-to={strike.target?.getAttribute('data-rival-card-id') ?? strike.target?.getAttribute('data-lp') ?? ''} />,
}))

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={store}>{ui}</Provider>)

// Ana invoca, Beto invoca, Ana ataca al monstruo de Beto y Beto ataca directo.
const mine = createMatState(Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`), [], 5)
const [h0] = mine.hand as [string]
const replay = buildDuelReplay({
  mode: 'link-auto',
  view: 'public',
  players: ['Ana', 'Beto'],
  starter: 0,
  mine: { initial: mine, actions: [{ type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'attack', id: h0, target: 'c1' }] },
  theirs: {
    initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5),
    acts: [
      { action: { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }, reveal: { c1: 'card-55144522-1' } },
      { action: { type: 'attack', id: 'c1' }, reveal: {} },
    ],
  },
  order: ['mine', 'theirs', 'mine', 'theirs'],
  life: [{ at: 0, lp: [8000, 8000] }],
  nameOf: () => 'Carta',
})

beforeEach(() => {
  vi.mocked(impactOn).mockClear()
  vi.mocked(sacrificeAt).mockClear()
  vi.mocked(playEntrance).mockClear()
  vi.mocked(playPendulum).mockClear()
  vi.mocked(entranceAllowed).mockReturnValue(false)
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(cleanup)

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

describe('los impactos de la mesa en el replay de un duelo', () => {
  it('una Invocación, de los dos lados: el anillo desde su casilla y la sacudida leve del campo cuando la carta toca (los tiempos del vuelo de la mesa)', () => {
    render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} startAt={0} />)
    const field = document.querySelector('[data-field]')

    next()
    expect(impactOn).toHaveBeenCalledTimes(1)
    const [cell, shaken, shake, delay] = vi.mocked(impactOn).mock.calls[0]!
    expect((cell as Element).querySelector('[data-card-id]')).not.toBeNull()
    expect(shaken).toBe(field)
    expect(shaken).toContainElement(screen.getByRole('group', { name: 'Mesa del duelo' }))
    expect([shake, delay]).toEqual(['light', landingDelay(true, false)])

    next()
    expect(impactOn).toHaveBeenCalledTimes(2)
    expect((vi.mocked(impactOn).mock.calls[1]![0] as Element).querySelector('[data-rival-card-id="c1"]')).not.toBeNull()
  })

  it('un ataque: la espada de la mesa, de la carta que ataca a su objetivo o a la chapa de vidas', () => {
    render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} startAt={2} />)

    next()
    expect(screen.getByTestId('strike')).toHaveAttribute('data-to', 'c1')
    expect(screen.getByTestId('strike').getAttribute('data-from')).not.toBe('')
    next()
    expect(screen.getByTestId('strike')).toHaveAttribute('data-to', 'mine')
  })

  it('a pantalla completa (la capa del replay, `z-160`), el impacto y la espada, que van en el `body`, quedan encima mientras está abierta', () => {
    const { unmount } = render(<ReplayLayer replay={replay} onClose={() => {}} />)
    expect(document.body).toHaveClass('*:data-fx:z-170!')
    unmount()
    expect(document.body).not.toHaveClass('*:data-fx:z-170!')
  })

  it('lo que sale del Extra Deck lleva la entrada larga de la mesa (no el anillo de siempre); saltar la corta', () => {
    const cancel = vi.fn()
    vi.mocked(entranceAllowed).mockReturnValue(true)
    vi.mocked(playEntrance).mockReturnValue({ cancel } as unknown as Animation)
    const extra = createMatState(Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`), ['card-84013237-1'], 5)
    const xyz = buildDuelReplay({
      mode: 'link-auto',
      view: 'public',
      players: ['Ana', 'Beto'],
      starter: 0,
      mine: { initial: extra, actions: [{ type: 'summon', id: 'card-84013237-1', how: 'xyz', materials: [], zone: 'emz', index: 0, pos: 'atk' }] },
      theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [] },
      order: ['mine'],
      life: [{ at: 0, lp: [8000, 8000] }],
      nameOf: () => 'Carta',
    })
    render(<DuelReplayScreen replay={xyz} onClose={() => {}} actions={[]} startAt={0} />)

    next()
    expect(playEntrance).toHaveBeenCalledTimes(1)
    expect(vi.mocked(playEntrance).mock.calls[0]![0]).toMatchObject({ kind: 'xyz', art: expect.stringContaining('84013237') })
    expect(impactOn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(cancel).toHaveBeenCalled()
  })

  it('la Invocación por Péndulo del duelo manual: una sola escena con todas sus cartas (la primera espera escondida a la siguiente); en el automático, la llegada Especial de siempre; el Sacrificio sale de las cartas que se sacrifican', () => {
    const cancel = vi.fn()
    vi.mocked(entranceAllowed).mockReturnValue(true)
    vi.mocked(playPendulum).mockReturnValue({ cancel } as unknown as Animation)
    Element.prototype.animate = () => ({ cancel: vi.fn() }) as unknown as Animation
    const [a, b, c, d] = mine.hand as [string, string, string, string]
    const build = (mode: 'link' | 'link-auto') =>
      buildDuelReplay({
        mode,
        view: 'public',
        players: ['Ana', 'Beto'],
        starter: 0,
        mine: {
          initial: mine,
          actions: [
            { type: 'place', id: a, zone: 'mz', index: 0, pos: 'atk', how: 'pendulum' },
            { type: 'place', id: b, zone: 'mz', index: 1, pos: 'atk', how: 'pendulum' },
            { type: 'tribute', id: c, tributes: [a, b], zone: 'mz', index: 2, pos: 'set' },
            { type: 'place', id: d, zone: 'mz', index: 3, pos: 'atk', how: 'pendulum' },
          ],
        },
        theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [] },
        order: ['mine', 'mine', 'mine', 'mine'],
        life: [{ at: 0, lp: [8000, 8000] }],
        nameOf: () => 'Carta',
      })
    render(<DuelReplayScreen replay={build('link')} onClose={() => {}} actions={[]} startAt={0} />)
    next()
    expect(playPendulum).not.toHaveBeenCalled()
    expect(impactOn).not.toHaveBeenCalled()
    next()
    expect(playPendulum).toHaveBeenCalledTimes(1)
    expect(vi.mocked(playPendulum).mock.calls[0]![0].cards).toHaveLength(2)
    next()
    expect(sacrificeAt).toHaveBeenCalledTimes(2)

    cleanup()
    vi.mocked(playPendulum).mockClear()
    render(<DuelReplayScreen replay={build('link-auto')} onClose={() => {}} actions={[]} startAt={0} />)
    next()
    expect(playPendulum).not.toHaveBeenCalled()
    expect(vi.mocked(impactOn).mock.calls[0]![4]).toBe('special')
    delete (Element.prototype as Partial<Element>).animate
  })

  it('saltar (atrás, al principio) no trae impacto; con movimiento reducido, tampoco la espada', () => {
    render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} startAt={3} />)

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(impactOn).not.toHaveBeenCalled()
    expect(screen.queryByTestId('strike')).toBeNull()

    cleanup()
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<DuelReplayScreen replay={replay} onClose={() => {}} actions={[]} startAt={2} />)
    next()
    expect(screen.queryByTestId('strike')).toBeNull()
  })
})
