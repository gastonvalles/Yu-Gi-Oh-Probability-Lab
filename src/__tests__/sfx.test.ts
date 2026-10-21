// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { unlockAudio } from '../app/audio'
import type { MatAction } from '../app/practice-mat'
import { playSfx, sfxOfAction } from '../app/sfx'
import { setSoundsOn } from '../app/sound-prefs'

const started = { oscillators: 0, sources: 0 }

class FakeAudioContext {
  currentTime = 0
  sampleRate = 8000
  destination = {}
  resume = vi.fn(async () => undefined)

  createBuffer(_channels: number, length: number) {
    return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(length) }
  }

  createOscillator() {
    const node = { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next, start: () => { started.oscillators += 1 }, stop: vi.fn() }

    return node
  }

  createBufferSource() {
    return { buffer: null, connect: (next: unknown) => next, start: () => { started.sources += 1 } }
  }

  createBiquadFilter() {
    return { type: '', Q: { value: 0 }, frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next }
  }

  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (next: unknown) => next }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  setSoundsOn(true)
  started.oscillators = 0
  started.sources = 0
})

describe('qué suena con cada jugada', () => {
  const cases: Array<[MatAction, ReturnType<typeof sfxOfAction>]> = [
    [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, 'summon'],
    [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'special' }, 'special'],
    [{ type: 'place', id: 'a', zone: 'st', index: 0, pos: 'set' }, 'set'],
    [{ type: 'place', id: 'a', zone: 'st', index: 1, pos: 'atk' }, 'activate'],
    [{ type: 'tribute', id: 'a', tributes: ['b'], zone: 'mz', index: 0, pos: 'atk' }, 'summon'],
    [{ type: 'summon', id: 'a', how: 'synchro', materials: [], zone: 'emz', index: 0, pos: 'atk' }, 'synchro'],
    [{ type: 'summon', id: 'a', how: 'link', materials: ['b'], zone: 'emz', index: 0, pos: 'atk' }, 'link'],
    [{ type: 'move', id: 'a', to: 'gy' }, 'grave'],
    [{ type: 'move', id: 'a', to: 'banished' }, 'banish'],
    [{ type: 'draw', count: 1 }, 'draw'],
    [{ type: 'shuffle', seed: 1 }, 'shuffle'],
    [{ type: 'attack', id: 'a' }, 'attack'],
    [{ type: 'phase', phase: 'battle' }, 'phase'],
    [{ type: 'phase', phase: 'draw' }, 'turn'],
    [{ type: 'activate', id: 'a' }, 'activate'],
    [{ type: 'give', id: 'a', auto: true }, null],
    // Un lote suena una vez, como su primera carta (el barajado que la acompaña no suena aparte); vacío o dentro de otro, nada.
    [{ type: 'batch', actions: [{ type: 'shuffle', seed: 1 }, { type: 'move', id: 'a', to: 'gy' }, { type: 'move', id: 'b', to: 'gy' }] }, 'grave'],
    [{ type: 'batch', actions: [{ type: 'target', id: 'a' }, { type: 'target', id: 'b' }] }, 'tick'],
    [{ type: 'batch', actions: [{ type: 'move', id: 'a', to: 'deck' }, { type: 'shuffle', seed: 1 }] }, 'shuffle'],
    [{ type: 'batch', actions: [] }, null],
    [{ type: 'batch', actions: [{ type: 'batch', actions: [{ type: 'move', id: 'a', to: 'gy' }] }] }, null],
  ]

  it.each(cases)('%j suena %s', (action, expected) => {
    expect(sfxOfAction(action)).toBe(expected)
  })
})

describe('el efecto de sonido', () => {
  it('no suena (ni falla) con el audio sin desbloquear', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)

    expect(() => playSfx('summon')).not.toThrow()
    expect(started).toEqual({ oscillators: 0, sources: 0 })
  })

  it('suena con notas y ruido, y se calla con los sonidos apagados', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    unlockAudio()

    playSfx('summon')
    expect(started).toEqual({ oscillators: 2, sources: 1 })

    setSoundsOn(false)
    playSfx('summon')
    expect(started).toEqual({ oscillators: 2, sources: 1 })
    expect(localStorage.getItem('ygo-lab:duel-sounds')).toBe('off')
  })
})
