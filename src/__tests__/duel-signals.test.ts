import { describe, expect, it } from 'vitest'

import { GOOD_MESSAGE, HOLD_MESSAGE, isHold, isRelease, isSignal, thinkingMessage } from '../components/duel/signals'

describe('las señales rápidas del duelo', () => {
  it('son sólo el emoji, sin texto', () => {
    expect(thinkingMessage()).toBe('🤔')
    expect(GOOD_MESSAGE).toBe('👍')
    expect(HOLD_MESSAGE).toBe('✋')
  })

  it('se reconocen las dos y el 💭 con texto de versiones anteriores', () => {
    expect(isSignal('🤔')).toBe(true)
    expect(isSignal('👍')).toBe(true)
    expect(isSignal('✋')).toBe(true)
    expect(isSignal('💭 Pensando…')).toBe(true)
  })

  it('✋ pide esperar y sólo 👍 (continuá) lo suelta: ninguna otra señal ni mensaje', () => {
    expect(isHold('✋')).toBe(true)
    expect(isRelease('👍')).toBe(true)
    for (const text of ['🤔', '👍', '✋ esperá', 'hola']) expect(isHold(text)).toBe(false)
    for (const text of ['🤔', '✋', '👍 dale', 'hola']) expect(isRelease(text)).toBe(false)
  })

  it('un mensaje escrito que sólo empieza con 🤔, ✋ o 👍 es un mensaje, no una señal (si no, se perdería)', () => {
    expect(isSignal('✋ esperá un segundo')).toBe(false)
    expect(isSignal('🤔 dejame pensar la respuesta')).toBe(false)
    expect(isSignal('👍 dale')).toBe(false)
    expect(isSignal('hola')).toBe(false)
  })
})
