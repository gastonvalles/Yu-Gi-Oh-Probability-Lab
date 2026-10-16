import { describe, expect, it } from 'vitest'

import { GOOD_MESSAGE, isSignal, thinkingMessage } from '../components/duel/signals'

describe('las señales rápidas del duelo', () => {
  it('son sólo el emoji, sin texto', () => {
    expect(thinkingMessage()).toBe('🤔')
    expect(GOOD_MESSAGE).toBe('👍')
  })

  it('se reconocen las dos y el 💭 con texto de versiones anteriores', () => {
    expect(isSignal('🤔')).toBe(true)
    expect(isSignal('👍')).toBe(true)
    expect(isSignal('💭 Pensando…')).toBe(true)
  })

  it('un mensaje escrito que sólo empieza con 🤔 o 👍 es un mensaje, no una señal (si no, se perdería)', () => {
    expect(isSignal('🤔 dejame pensar la respuesta')).toBe(false)
    expect(isSignal('👍 dale')).toBe(false)
    expect(isSignal('hola')).toBe(false)
  })
})
