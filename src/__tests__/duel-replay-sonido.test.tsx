// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FIRST_DEAL_MS, NEXT_DEAL_MS } from '../app/deal-flight'
import { buildDuelReplay } from '../app/duel-replay'
import { createMatState } from '../app/practice-mat'
import { setSoundsOn } from '../app/sound-prefs'
import { DuelReplayScreen } from '../components/replays/DuelReplayScreen'

// El replay suena como la mesa: cada jugada con el sonido de `sfxOfAction`, el reparto con `shuffle` y `draw`, con la misma preferencia (`sound-prefs`) y el mismo audio desbloqueado.
// `playSfx` pasa a lo real (así rige su guarda de «sonidos apagados») y lo que llega al audio se cuenta en el contexto de mentira.
const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))
vi.mock('../app/sfx', async () => {
  const actual = await vi.importActual<typeof import('../app/sfx')>('../app/sfx')
  return { ...actual, playSfx: (kind: Parameters<typeof actual.playSfx>[0]) => (playSfx(kind), actual.playSfx(kind)) }
})

const started = { nodes: 0 }
class FakeAudioContext {
  currentTime = 0
  sampleRate = 8000
  destination = {}
  resume = vi.fn(async () => undefined)
  createBuffer(_channels: number, length: number) {
    return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(length) }
  }
  createOscillator() {
    return { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next, start: () => void (started.nodes += 1), stop: vi.fn() }
  }
  createBufferSource() {
    return { buffer: null, connect: (next: unknown) => next, start: () => void (started.nodes += 1) }
  }
  createBiquadFilter() {
    return { type: '', Q: { value: 0 }, frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next }
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next }
  }
}

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={store}>{ui}</Provider>)
const deckOf = (prefix: string) => Array.from({ length: 20 }, (_, i) => `${prefix}${i + 1}`)

// Por enlace: robar no (las manos ya vienen), cambio de fase (`phase`), Invocación Normal (`summon`) y una carta boca abajo (`set`).
const replay = () => {
  const mine = createMatState(deckOf('card-14558127-'), [], 5)
  return buildDuelReplay({
    mode: 'link',
    view: 'public',
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: mine.hand[0]!, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'place', id: mine.hand[1]!, zone: 'st', index: 0, pos: 'set' }] },
    theirs: { initial: createMatState(deckOf('c'), [], 5), acts: [] },
    order: ['mine', 'mine', 'mine'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: () => 'Ash Blossom',
  })
}

const sounds = () => playSfx.mock.calls.map(([kind]) => kind)
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
let reduced = false

beforeEach(() => {
  reduced = true
  vi.useFakeTimers()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  playSfx.mockClear()
  started.nodes = 0
})
afterEach(() => {
  cleanup()
  setSoundsOn(true)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('el replay de un duelo suena como la mesa', () => {
  it('al reproducir, cada jugada suena con el sonido que la mesa le pone (fase, invocación, boca abajo)', () => {
    render(<DuelReplayScreen replay={replay()} onClose={() => {}} actions={[]} startAt={0} />)

    expect(sounds()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    advance(900)
    advance(900)
    advance(900)
    expect(sounds()).toEqual(['phase', 'summon', 'set'])
    expect(started.nodes).toBeGreaterThan(0)
  })

  it('con «Siguiente» suena la jugada; saltar (línea de tiempo, anterior, volver al principio) no suena', () => {
    render(<DuelReplayScreen replay={replay()} onClose={() => {}} actions={[]} startAt={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(sounds()).toEqual(['phase'])
    playSfx.mockClear()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Línea de tiempo del replay' }), { key: 'End' })
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(sounds()).toEqual([])
  })

  it('abierto por su comienzo, el reparto suena: el barajado y una carta por vez (sólo el lado de abajo cuando los dos reparten a la vez)', () => {
    reduced = false
    render(<DuelReplayScreen replay={replay()} onClose={() => {}} actions={[]} startAt={0} />)

    advance(FIRST_DEAL_MS)
    for (let card = 1; card < 5; card += 1) advance(NEXT_DEAL_MS)
    expect(sounds()).toEqual(['shuffle', 'draw', 'draw', 'draw', 'draw', 'draw'])
  })

  it('con los sonidos apagados (el «Sonidos» del menú, el mismo de la mesa) no suena nada', () => {
    render(<DuelReplayScreen replay={replay()} onClose={() => {}} actions={[]} startAt={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Más opciones de/ }))
    fireEvent.click(screen.getByText('Sonidos'))
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    advance(900)
    advance(900)
    expect(sounds()).toEqual(['phase', 'summon'])
    expect(started.nodes).toBe(0)
  })

  it('con la pestaña oculta, silencio', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<DuelReplayScreen replay={replay()} onClose={() => {}} actions={[]} startAt={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    advance(900)
    expect(sounds()).toEqual([])
  })
})
