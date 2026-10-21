// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { matArrows, MAX_ARROWS, type MatArrow } from '../app/mat-arrows'
import { describeStep } from '../app/mat-step-info'
import { createMatState, matReducer, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { MatSnapshot } from '../components/probability/MatSnapshot'

// La mano son las primeras cinco (a-e); el deck sigue con f-k; el Extra, con x1 y x2.
const start = createMatState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'], ['x1', 'x2'], 5)

/** Las flechas de una jugada sobre una mesa: lo que se mueve (`describeStep`) y la mesa de después. */
const arrowsOf = (before: MatState, action: MatAction, limit?: number) => matArrows(describeStep(before, action).moves, matReducer(before, action), limit)
const arrow = (from: string, to: string, count = 1): MatArrow => ({ from, to, count })

describe('las flechas de cada jugada', () => {
  it('de una pila a una casilla, de una casilla a una pila y de una casilla a otra', () => {
    const board = replayMat(start, [
      { type: 'place', id: 'a', zone: 'mz', index: 2, pos: 'atk' },
      { type: 'place', id: 'b', zone: 'st', index: 0, pos: 'set' },
    ])

    expect(arrowsOf(start, { type: 'place', id: 'a', zone: 'mz', index: 2, pos: 'atk' })).toEqual([arrow('hand', 'mz:2')])
    expect(arrowsOf(start, { type: 'place', id: 'c', zone: 'field', index: 0, pos: 'atk' })).toEqual([arrow('hand', 'field:0')])
    expect(arrowsOf(board, { type: 'move', id: 'a', to: 'gy' })).toEqual([arrow('mz:2', 'gy')])
    expect(arrowsOf(board, { type: 'move', id: 'b', to: 'hand' })).toEqual([arrow('st:0', 'hand')])
    expect(arrowsOf(board, { type: 'place', id: 'a', zone: 'mz', index: 4, pos: 'atk' })).toEqual([arrow('mz:2', 'mz:4')])
  })

  it('a la mano y entre pilas; lo que hace el mismo camino va en una sola flecha, con la cantidad', () => {
    const inGy = replayMat(start, [{ type: 'move', id: 'a', to: 'gy' }])

    expect(arrowsOf(start, { type: 'draw', count: 1 })).toEqual([arrow('deck', 'hand')])
    expect(arrowsOf(start, { type: 'draw', count: 5 })).toEqual([arrow('deck', 'hand', 5)])
    expect(arrowsOf(start, { type: 'mill', count: 3 })).toEqual([arrow('deck', 'gy', 3)])
    expect(arrowsOf(inGy, { type: 'move', id: 'a', to: 'hand' })).toEqual([arrow('gy', 'hand')])
    expect(arrowsOf(inGy, { type: 'move', id: 'a', to: 'banished', faceDown: true })).toEqual([arrow('gy', 'banished')])
  })

  it('un lote (varias cartas en una jugada) es una sola flecha con la cantidad: «Main → GY ×3»', () => {
    const batch: MatAction = { type: 'batch', actions: [{ type: 'shuffle', seed: 4 }, ...['f', 'h', 'j'].map((id): MatAction => ({ type: 'move', id, to: 'gy' }))] }

    expect(arrowsOf(start, batch)).toEqual([arrow('deck', 'gy', 3)])
    // De la mano al destierro, igual: un camino, una flecha.
    expect(arrowsOf(start, { type: 'batch', actions: ['a', 'b'].map((id): MatAction => ({ type: 'move', id, to: 'banished', faceDown: true })) })).toEqual([arrow('hand', 'banished', 2)])
  })

  it('debajo de un Xyz es la casilla del Xyz: al invocarlo, al ponerle o sacarle un material y cuando se va con los suyos', () => {
    const board = replayMat(start, [
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'b', zone: 'mz', index: 1, pos: 'atk' },
    ])
    const xyz: MatAction = { type: 'summon', id: 'x1', how: 'xyz', materials: ['a', 'b'], zone: 'emz', index: 0, pos: 'atk' }
    const summoned = matReducer(board, xyz)

    // La carta de la jugada primero.
    expect(arrowsOf(board, xyz)).toEqual([arrow('extra', 'emz:0'), arrow('mz:0', 'emz:0'), arrow('mz:1', 'emz:0')])
    expect(arrowsOf(summoned, { type: 'move', id: 'a', to: 'gy' })).toEqual([arrow('emz:0', 'gy')])
    expect(arrowsOf(summoned, { type: 'attach', id: 'c', to: 'x1' })).toEqual([arrow('hand', 'emz:0')])
    // El Xyz se va al cementerio con sus dos materiales: el mismo camino, desde la casilla que dejó.
    expect(arrowsOf(summoned, { type: 'move', id: 'x1', to: 'gy' })).toEqual([arrow('emz:0', 'gy', 3)])
  })

  it('una ficha que aparece, una carta que se va de la mesa o una jugada que no mueve nada no llevan flecha', () => {
    const board = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])

    expect(arrowsOf(start, { type: 'token', zone: 'mz', index: 0 })).toEqual([])
    expect(arrowsOf(board, { type: 'give', id: 'a' })).toEqual([])
    expect(arrowsOf(board, { type: 'activate', id: 'a' })).toEqual([])
    expect(arrowsOf(board, { type: 'position', id: 'a', pos: 'def' })).toEqual([])
    expect(arrowsOf(start, { type: 'shuffle', seed: 3 })).toEqual([])
  })

  it('un paso lleva hasta seis flechas: las primeras, empezando por la carta de la jugada', () => {
    // Un Enlace con cinco monstruos y un Xyz (con sus dos materiales): siete caminos.
    const board = replayMat(start, [
      { type: 'draw', count: 2 },
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'b', zone: 'mz', index: 1, pos: 'atk' },
      { type: 'summon', id: 'x1', how: 'xyz', materials: ['a', 'b'], zone: 'emz', index: 0, pos: 'atk' },
      ...(['c', 'd', 'e', 'f', 'g'] as const).map((id, index): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'atk' })),
    ])
    const link: MatAction = { type: 'summon', id: 'x2', how: 'link', materials: ['c', 'd', 'e', 'f', 'g', 'x1'], zone: 'emz', index: 1, pos: 'atk' }
    const all = arrowsOf(board, link, Infinity)

    expect(MAX_ARROWS).toBe(6)
    expect(all).toEqual([arrow('extra', 'emz:1'), ...[0, 1, 2, 3, 4].map((index) => arrow(`mz:${index}`, 'gy')), arrow('emz:0', 'gy', 3)])
    expect(arrowsOf(board, link)).toEqual(all.slice(0, MAX_ARROWS))
    expect(arrowsOf(board, link, 2)).toEqual(all.slice(0, 2))
  })
})

describe('las flechas en el tablero chico', () => {
  afterEach(cleanup)

  const noArt = () => null
  /**
   * Los puntos por donde pasa un trazo (`M inicio Q control fin M brazo L fin L brazo`): la curva (once puntos de la cuadrática, no su punto de control, que puede quedar
   * afuera) y los brazos de la cabeza.
   */
  const pointsOf = (d: string) => {
    const [start, control, end, left, , right] = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).flatMap((value, index, all) => (index % 2 === 0 ? [[value, all[index + 1]!] as const] : []))
    const curve = Array.from({ length: 11 }, (_, step) => {
      const t = step / 10

      return [0, 1].map((axis) => (1 - t) ** 2 * start![axis]! + 2 * (1 - t) * t * control![axis]! + t ** 2 * end![axis]!) as [number, number]
    })

    return [...curve, left!, right!]
  }

  it('dibuja una línea por camino (la curva y la V de la punta), escondida a los lectores de pantalla, con la cantidad si es más de una carta', () => {
    const arrows = [arrow('deck', 'hand', 5), arrow('gy', 'mz:0'), arrow('mz:3', 'gy'), arrow('extra', 'emz:1'), arrow('banished', 'field:0'), arrow('st:4', 'deck')]
    const { container } = render(<MatSnapshot state={matReducer(start, { type: 'draw', count: 5 })} arrows={arrows} artOf={noArt} />)
    const drawing = container.querySelector('[data-arrows]')
    const lines = [...container.querySelectorAll('[data-arrow]')]

    expect(lines.map((line) => line.getAttribute('data-arrow'))).toEqual(['deck>hand', 'gy>mz:0', 'mz:3>gy', 'extra>emz:1', 'banished>field:0', 'st:4>deck'])
    // Un dibujo dentro del tablero, los dos escondidos a los lectores de pantalla (la frase del paso ya lo dice).
    expect(drawing).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-snapshot]')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-snapshot]')).toContainElement(drawing as HTMLElement)
    // Sólo el camino de cinco cartas lleva número; las demás, no.
    expect(drawing?.querySelectorAll('text')).toHaveLength(1)
    expect(drawing).toHaveTextContent('×5')

    // Cada una es una curva y su cabeza, sin salirse del tablero (en las pruebas no se mide: el de la columna de la mesa, 232 × 143,6 px con la mano).
    for (const line of lines) {
      const d = line.getAttribute('d') ?? ''

      expect(d).toMatch(/^M[^MQL]+Q[^MQL]+M[^MQL]+L[^MQL]+L[^MQL]+$/)
      for (const [x, y] of pointsOf(d)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(232)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(143.6)
      }
    }
  })

  it('sin movimientos (o sin flechas) no dibuja nada', () => {
    const { container, rerender } = render(<MatSnapshot state={start} arrows={[]} artOf={noArt} />)

    expect(container.querySelector('[data-arrows]')).toBeNull()
    rerender(<MatSnapshot state={start} artOf={noArt} />)
    expect(container.querySelector('[data-arrows]')).toBeNull()
  })
})
