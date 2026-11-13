import { describe, expect, it } from 'vitest'

import { GOOD_MESSAGE, isEmojiSignal, thinkingMessage } from '../app/duel-signals'

describe('las señales rápidas del duelo', () => {
  it('son sólo el emoji, sin texto', () => {
    expect(thinkingMessage()).toBe('🤔')
    expect(GOOD_MESSAGE).toBe('👍')
  })

  it('se reconocen las dos; el ✋ «Esperá» y el 💭 con texto de antes que mande un cliente viejo son un mensaje más', () => {
    expect(isEmojiSignal('🤔')).toBe(true)
    expect(isEmojiSignal('👍')).toBe(true)
    expect(isEmojiSignal('✋')).toBe(false)
    expect(isEmojiSignal('💭 Pensando…')).toBe(false)
  })

  it('un mensaje escrito que sólo empieza con 🤔, ✋ o 👍 es un mensaje, no una señal (si no, se perdería)', () => {
    expect(isEmojiSignal('✋ esperá un segundo')).toBe(false)
    expect(isEmojiSignal('🤔 dejame pensar la respuesta')).toBe(false)
    expect(isEmojiSignal('👍 dale')).toBe(false)
    expect(isEmojiSignal('hola')).toBe(false)
  })
})
