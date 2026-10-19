// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { unlockAudio } from '../app/audio'
import { playChatSound } from '../app/chat-sound'

const oscillators: Array<{ frequency: { value: number }; start: ReturnType<typeof vi.fn> }> = []

class FakeAudioContext {
  currentTime = 0
  destination = {}
  resume = vi.fn(async () => undefined)

  createOscillator() {
    const oscillator = { type: '', frequency: { value: 0 }, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn() }

    oscillators.push(oscillator)

    return oscillator
  }

  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: () => undefined }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('el sonido de un mensaje del chat', () => {
  it('no suena (ni falla) mientras el audio no se desbloqueó con un toque', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)

    expect(() => playChatSound('theirs')).not.toThrow()
    expect(oscillators).toHaveLength(0)
  })

  it('el tuyo es una nota grave y el del rival, dos que suben', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    unlockAudio()

    playChatSound('mine')
    expect(oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([520])

    oscillators.length = 0
    playChatSound('theirs')

    const [first, second] = oscillators.map((oscillator) => oscillator.frequency.value)

    expect(oscillators).toHaveLength(2)
    expect(second).toBeGreaterThan(first!)
    expect(first).toBeGreaterThan(520)
  })
})
