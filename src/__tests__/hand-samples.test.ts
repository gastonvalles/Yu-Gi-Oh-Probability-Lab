// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { deckSampleKey, readHandTally, recordHandRating, resetHandTally, wilsonInterval } from '../app/hand-samples'
import type { CardEntry } from '../types'

const card = (id: string, copies: number) => ({ id, copies }) as CardEntry

beforeEach(() => {
  localStorage.clear()
})

describe('el muestreo de manos', () => {
  it('el intervalo de Wilson da los valores de referencia', () => {
    const round = (values: [number, number]) => values.map((value) => Number(value.toFixed(3)))

    expect(round(wilsonInterval(8, 10))).toEqual([0.49, 0.943])
    expect(round(wilsonInterval(16, 20))).toEqual([0.584, 0.919])
    expect(round(wilsonInterval(80, 100))).toEqual([0.711, 0.867])
    expect(wilsonInterval(0, 0)).toEqual([0, 1])
    expect(wilsonInterval(0, 5)[0]).toBe(0)
    expect(wilsonInterval(5, 5)[1]).toBe(1)
  })

  it('la clave es la lista de cartas y la mano, sin importar el orden', () => {
    const a = deckSampleKey([card('card-1', 3), card('card-2', 2), card('card-3', 0)], 5)
    const b = deckSampleKey([card('card-2', 2), card('card-1', 3)], 5)

    expect(a).toBe(b)
    expect(deckSampleKey([card('card-1', 2), card('card-2', 2)], 5)).not.toBe(a)
    expect(deckSampleKey([card('card-1', 3), card('card-2', 2)], 6)).not.toBe(a)
  })

  it('suma, mueve una calificación cambiada, sobrevive a recargar y se reinicia', () => {
    expect(readHandTally('deck')).toEqual({ playable: 0, dead: 0 })

    expect(recordHandRating('deck', 'playable')).toEqual({ playable: 1, dead: 0 })
    expect(recordHandRating('deck', 'dead')).toEqual({ playable: 1, dead: 1 })
    // La misma mano, cambiada de opinión: se mueve, no se suma.
    expect(recordHandRating('deck', 'playable', 'dead')).toEqual({ playable: 2, dead: 0 })
    expect(readHandTally('deck')).toEqual({ playable: 2, dead: 0 })
    expect(readHandTally('otro')).toEqual({ playable: 0, dead: 0 })

    resetHandTally('deck')
    expect(readHandTally('deck')).toEqual({ playable: 0, dead: 0 })
  })

  it('ignora lo guardado con otra forma', () => {
    localStorage.setItem('ygo-lab:hand-samples:v1', '{"deck":{"playable":"2","dead":1},"bien":{"playable":4,"dead":1}}')

    expect(readHandTally('deck')).toEqual({ playable: 0, dead: 0 })
    expect(readHandTally('bien')).toEqual({ playable: 4, dead: 1 })

    localStorage.setItem('ygo-lab:hand-samples:v1', 'basura')
    expect(readHandTally('bien')).toEqual({ playable: 0, dead: 0 })
  })
})
